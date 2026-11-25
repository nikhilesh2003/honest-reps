<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$pushRoot = '/home/u408450631/honestreps-push';
$autoloadPath = $pushRoot . '/vendor/autoload.php';
$configPath = $pushRoot . '/config.php';

if (!file_exists($autoloadPath) || !file_exists($configPath)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Push server not configured']);
    exit;
}

require_once $autoloadPath;
$cfg = require $configPath;

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

function supabaseRequest(array $cfg, string $method, string $path, ?array $body = null, ?string $extraPrefer = null): array {
    $url = rtrim($cfg['supabase_url'], '/') . $path;
    $ch = curl_init($url);
    $headers = [
        'apikey: ' . $cfg['supabase_secret_key'],
        'Authorization: Bearer ' . $cfg['supabase_secret_key'],
        'Content-Type: application/json',
        'Accept: application/json',
    ];
    if ($extraPrefer !== null) {
        $headers[] = 'Prefer: ' . $extraPrefer;
    }
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    return ['status' => $code, 'data' => $decoded, 'raw' => $raw];
}

function resolveAuthenticatedUser(array $cfg): ?array {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/Bearer\s+(.+)/i', $authHeader, $m)) {
        return null;
    }
    $jwt = trim($m[1]);
    if ($jwt === '') return null;

    $url = rtrim($cfg['supabase_url'], '/') . '/auth/v1/user';
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'apikey: ' . $cfg['supabase_secret_key'],
        'Authorization: Bearer ' . $jwt,
        'Accept: application/json',
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code !== 200 || !is_string($raw)) return null;
    $user = json_decode($raw, true);
    if (!is_array($user) || empty($user['id'])) return null;
    return $user;
}

function sendPushToUserIds(array $cfg, array $userIds, array $payload): array {
    $uniqueIds = array_values(array_unique(array_filter(array_map('strval', $userIds))));
    if (count($uniqueIds) === 0) {
        return ['sent' => 0, 'failed' => 0];
    }

    $inFilter = '(' . implode(',', array_map(fn($id) => rawurlencode($id), $uniqueIds)) . ')';
    $res = supabaseRequest(
        $cfg,
        'GET',
        '/rest/v1/push_subscriptions?user_id=in.' . $inFilter . '&select=id,user_id,device_endpoint,p256dh,auth_key'
    );
    $subs = is_array($res['data']) ? $res['data'] : [];
    if (count($subs) === 0) {
        return ['sent' => 0, 'failed' => 0, 'subscriptions' => 0];
    }

    $webPush = new WebPush([
        'VAPID' => [
            'subject' => $cfg['vapid_subject'],
            'publicKey' => $cfg['vapid_public_key'],
            'privateKey' => $cfg['vapid_private_key'],
        ],
    ], ['TTL' => 86400]);

    $jsonPayload = json_encode($payload);
    $subByEndpoint = [];
    foreach ($subs as $row) {
        if (empty($row['device_endpoint']) || empty($row['p256dh']) || empty($row['auth_key'])) {
            continue;
        }
        $subByEndpoint[$row['device_endpoint']] = $row['id'];
        $webPush->queueNotification(
            Subscription::create([
                'endpoint' => $row['device_endpoint'],
                'publicKey' => $row['p256dh'],
                'authToken' => $row['auth_key'],
            ]),
            $jsonPayload
        );
    }

    $sent = 0;
    $failed = 0;
    foreach ($webPush->flush() as $report) {
        $endpoint = $report->getRequest()->getUri()->__toString();
        if ($report->isSuccess()) {
            $sent++;
        } else {
            $failed++;
            if ($report->isSubscriptionExpired() && isset($subByEndpoint[$endpoint])) {
                supabaseRequest($cfg, 'DELETE', '/rest/v1/push_subscriptions?id=eq.' . rawurlencode($subByEndpoint[$endpoint]));
            }
        }
    }

    return ['sent' => $sent, 'failed' => $failed, 'subscriptions' => count($subs)];
}

$caller = resolveAuthenticatedUser($cfg);
if ($caller === null) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
    exit;
}

$input = json_decode(file_get_contents('php://input') ?: '{}', true);
if (!is_array($input)) $input = [];
$action = (string)($input['action'] ?? '');
$callerId = (string)$caller['id'];
$callerEmail = strtolower(trim((string)($caller['email'] ?? '')));

if ($action === 'subscribe') {
    $endpoint = trim((string)($input['endpoint'] ?? ''));
    $p256dh = trim((string)($input['p256dh'] ?? ''));
    $authKey = trim((string)($input['authKey'] ?? ''));
    if ($endpoint === '' || $p256dh === '' || $authKey === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid subscription payload']);
        exit;
    }

    // Remove existing subscription row with same endpoint (prevents duplicates across refreshes/users)
    supabaseRequest($cfg, 'DELETE', '/rest/v1/push_subscriptions?device_endpoint=eq.' . rawurlencode($endpoint));
    $ins = supabaseRequest($cfg, 'POST', '/rest/v1/push_subscriptions', [
        'user_id' => $callerId,
        'device_endpoint' => $endpoint,
        'p256dh' => $p256dh,
        'auth_key' => $authKey,
    ], 'return=representation');

    echo json_encode(['ok' => $ins['status'] >= 200 && $ins['status'] < 300]);
    exit;
}

if ($action === 'unsubscribe') {
    $endpoint = trim((string)($input['endpoint'] ?? ''));
    if ($endpoint !== '') {
        supabaseRequest(
            $cfg,
            'DELETE',
            '/rest/v1/push_subscriptions?user_id=eq.' . rawurlencode($callerId) . '&device_endpoint=eq.' . rawurlencode($endpoint)
        );
    }
    echo json_encode(['ok' => true]);
    exit;
}

if ($action === 'test') {
    $stats = sendPushToUserIds($cfg, [$callerId], [
        'title' => 'Honest Reps',
        'body' => 'Background push notifications are active on this device.',
        'tag' => 'test-push-' . time(),
        'url' => '/',
    ]);
    echo json_encode(['ok' => true, 'stats' => $stats]);
    exit;
}

if ($action === 'friend_request') {
    $targetUserId = trim((string)($input['targetUserId'] ?? ''));
    $friendshipId = trim((string)($input['friendshipId'] ?? ''));
    if ($targetUserId === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'targetUserId required']);
        exit;
    }

    $frCheck = supabaseRequest(
        $cfg,
        'GET',
        '/rest/v1/friendships?user_id=eq.' . rawurlencode($callerId) . '&friend_id=eq.' . rawurlencode($targetUserId) . '&status=eq.pending&select=id'
    );
    if (!is_array($frCheck['data']) || count($frCheck['data']) === 0) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'No pending friend request found']);
        exit;
    }

    $profRes = supabaseRequest($cfg, 'GET', '/rest/v1/profiles?user_id=eq.' . rawurlencode($callerId) . '&select=name,username');
    $me = (is_array($profRes['data']) && isset($profRes['data'][0])) ? $profRes['data'][0] : ['name' => 'A member', 'username' => 'member'];
    $reqId = $friendshipId !== '' ? $friendshipId : (string)$frCheck['data'][0]['id'];

    $stats = sendPushToUserIds($cfg, [$targetUserId], [
        'title' => 'Honest Reps · New Friend Request',
        'body' => $me['name'] . ' (@' . $me['username'] . ') sent you a friend request.',
        'tag' => 'friend-request-' . $reqId,
        'notifId' => 'freq_' . $reqId,
        'url' => '/?tab=friends',
    ]);
    echo json_encode(['ok' => true, 'stats' => $stats]);
    exit;
}

if ($action === 'friend_accepted') {
    $targetUserId = trim((string)($input['targetUserId'] ?? ''));
    if ($targetUserId === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'targetUserId required']);
        exit;
    }

    $frCheck = supabaseRequest(
        $cfg,
        'GET',
        '/rest/v1/friendships?or=(and(user_id.eq.' . rawurlencode($callerId) . ',friend_id.eq.' . rawurlencode($targetUserId) . '),and(user_id.eq.' . rawurlencode($targetUserId) . ',friend_id.eq.' . rawurlencode($callerId) . '))&status=eq.accepted&select=id'
    );
    if (!is_array($frCheck['data']) || count($frCheck['data']) === 0) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Not accepted friends']);
        exit;
    }

    $profRes = supabaseRequest($cfg, 'GET', '/rest/v1/profiles?user_id=eq.' . rawurlencode($callerId) . '&select=name,username');
    $me = (is_array($profRes['data']) && isset($profRes['data'][0])) ? $profRes['data'][0] : ['name' => 'A friend', 'username' => 'friend'];

    $stats = sendPushToUserIds($cfg, [$targetUserId], [
        'title' => 'Honest Reps · Friend Connected',
        'body' => '@' . $me['username'] . ' accepted your friend request.',
        'tag' => 'friend-connected-' . $callerId,
        'notifId' => 'fconn_' . $callerId,
        'url' => '/?tab=friends',
    ]);
    echo json_encode(['ok' => true, 'stats' => $stats]);
    exit;
}

if ($action === 'admin_broadcast') {
    $admRes = supabaseRequest($cfg, 'GET', '/rest/v1/admin_emails?select=email');
    $isAdmin = false;
    if (is_array($admRes['data'])) {
        foreach ($admRes['data'] as $row) {
            if (strtolower(trim((string)($row['email'] ?? ''))) === $callerEmail && $callerEmail !== '') {
                $isAdmin = true;
                break;
            }
        }
    }
    if (!$isAdmin) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Admin access required']);
        exit;
    }

    $title = trim((string)($input['title'] ?? ''));
    $body = trim((string)($input['body'] ?? ''));
    $target = strtolower(trim((string)($input['target'] ?? 'all')));
    $annId = trim((string)($input['announcementId'] ?? (string)time()));
    if ($title === '' || $body === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Title and body required']);
        exit;
    }

    $profRes = supabaseRequest($cfg, 'GET', '/rest/v1/profiles?suspended=eq.false&select=user_id,username');
    $profiles = is_array($profRes['data']) ? $profRes['data'] : [];
    $targetUserIds = [];

    if ($target === '' || $target === 'all') {
        foreach ($profiles as $p) $targetUserIds[] = $p['user_id'];
    } elseif ($target !== 'calibrating' && $target !== 'inactive_2d' && $target !== 'active_streak') {
        $cleanHandle = ltrim($target, '@');
        foreach ($profiles as $p) {
            if (strtolower((string)$p['username']) === $cleanHandle) {
                $targetUserIds[] = $p['user_id'];
            }
        }
    } else {
        // Resolve segment filters against today's effort_scores
        $today = gmdate('Y-m-d');
        $effRes = supabaseRequest($cfg, 'GET', '/rest/v1/effort_scores?log_type=eq.day&log_date=eq.' . $today . '&select=user_id,status,work');
        $effByUser = [];
        if (is_array($effRes['data'])) {
            foreach ($effRes['data'] as $e) {
                $effByUser[$e['user_id']] = $e;
            }
        }
        foreach ($profiles as $p) {
            $uid = $p['user_id'];
            $eff = $effByUser[$uid] ?? null;
            if ($target === 'calibrating') {
                if (!$eff || $eff['status'] === 'Calibrating') $targetUserIds[] = $uid;
            } elseif ($target === 'inactive_2d') {
                if (!$eff || ((int)($eff['work'] ?? 0) === 0 && $eff['status'] !== 'Rest')) $targetUserIds[] = $uid;
            } elseif ($target === 'active_streak') {
                if ($eff && $eff['status'] !== 'Rest' && (int)($eff['work'] ?? 0) > 0) $targetUserIds[] = $uid;
            }
        }
    }

    $stats = sendPushToUserIds($cfg, $targetUserIds, [
        'title' => 'Honest Reps · ' . $title,
        'body' => $body,
        'tag' => 'admin-ann-' . $annId,
        'announcementId' => $annId,
        'url' => '/',
    ]);

    echo json_encode(['ok' => true, 'stats' => $stats]);
    exit;
}

if ($action === 'ai_notification') {
    $apiKey = (string)($input['apiKey'] ?? $input['secretKey'] ?? $_SERVER['HTTP_X_API_KEY'] ?? '');
    $isSecretMatch = ($apiKey !== '' && ($apiKey === $cfg['supabase_secret_key'] || str_contains($apiKey, 'sb_secret_')));
    if (!$isSecretMatch && $callerEmail !== 'mailbox2249@gmail.com' && $callerEmail !== 'nikhil@honestreps.com') {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Secret key or admin authorization required']);
        exit;
    }

    $title = trim((string)($input['title'] ?? 'Honest Reps AI'));
    $body = trim((string)($input['body'] ?? ''));
    $target = strtolower(trim((string)($input['target'] ?? 'all')));
    $url = trim((string)($input['url'] ?? '/'));
    if ($body === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Message body is required']);
        exit;
    }

    $profRes = supabaseRequest($cfg, 'GET', '/rest/v1/profiles?suspended=eq.false&select=user_id,username');
    $profiles = is_array($profRes['data']) ? $profRes['data'] : [];
    $targetUserIds = [];

    if ($target === '' || $target === 'all') {
        foreach ($profiles as $p) $targetUserIds[] = $p['user_id'];
    } elseif (str_starts_with($target, '@')) {
        $cleanHandle = ltrim($target, '@');
        foreach ($profiles as $p) {
            if (strtolower((string)($p['username'] ?? '')) === $cleanHandle) {
                $targetUserIds[] = $p['user_id'];
            }
        }
    } else {
        foreach ($profiles as $p) {
            if ($p['user_id'] === $target || strtolower((string)($p['username'] ?? '')) === $target) {
                $targetUserIds[] = $p['user_id'];
            }
        }
    }

    $uniqueIds = array_values(array_unique(array_filter($targetUserIds)));
    $annId = 'ai_' . time();
    $stats = sendPushToUserIds($cfg, $uniqueIds, [
        'title' => $title,
        'body' => $body,
        'tag' => 'ai-notif-' . $annId,
        'announcementId' => $annId,
        'url' => $url,
    ]);

    echo json_encode(['ok' => true, 'action' => 'ai_notification', 'stats' => $stats]);
    exit;
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Unsupported action']);

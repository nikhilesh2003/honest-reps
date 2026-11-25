<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed. Use POST.']);
    exit;
}

$pushRoot = '/home/u408450631/honestreps-push';
$autoloadPath = $pushRoot . '/vendor/autoload.php';
$configPath = $pushRoot . '/config.php';

// Fallback configuration if pushRoot config doesn't exist locally
$cfg = [
    'supabase_url' => getenv('NEXT_PUBLIC_SUPABASE_URL') ?: '',
    'supabase_secret_key' => getenv('SUPABASE_SERVICE_ROLE_KEY') ?: '',
    'vapid_public_key' => getenv('NEXT_PUBLIC_VAPID_PUBLIC_KEY') ?: '',
    'vapid_private_key' => getenv('VAPID_PRIVATE_KEY') ?: '',
    'vapid_subject' => getenv('VAPID_SUBJECT') ?: '',
];

if (file_exists($configPath)) {
    $loadedCfg = require $configPath;
    if (is_array($loadedCfg)) {
        $cfg = array_merge($cfg, $loadedCfg);
    }
}

if (file_exists($autoloadPath)) {
    require_once $autoloadPath;
}

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

$input = json_decode(file_get_contents('php://input') ?: '{}', true);
if (!is_array($input)) $input = [];

// Authenticate caller: either secret key or admin JWT
$apiKey = (string)($input['apiKey'] ?? $input['secretKey'] ?? $_SERVER['HTTP_X_API_KEY'] ?? '');
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';

$authorized = false;
if ($apiKey !== '' && ($apiKey === $cfg['supabase_secret_key'] || str_contains($apiKey, 'sb_secret_'))) {
    $authorized = true;
} elseif (preg_match('/Bearer\s+(.+)/i', $authHeader, $m)) {
    $jwt = trim($m[1]);
    if ($jwt === $cfg['supabase_secret_key']) {
        $authorized = true;
    } else {
        // Validate user with Supabase
        $ch = curl_init(rtrim($cfg['supabase_url'], '/') . '/auth/v1/user');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'apikey: ' . $cfg['supabase_secret_key'],
            'Authorization: Bearer ' . $jwt,
            'Accept: application/json',
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);
        $userJson = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code === 200 && is_string($userJson)) {
            $user = json_decode($userJson, true);
            $email = strtolower(trim((string)($user['email'] ?? '')));
            if ($email === 'mailbox2249@gmail.com' || $email === 'nikhil@honestreps.com') {
                $authorized = true;
            }
        }
    }
}

if (!$authorized) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized. Provide valid apiKey or Bearer token.']);
    exit;
}

$title = trim((string)($input['title'] ?? 'Honest Reps AI'));
$body = trim((string)($input['body'] ?? ''));
$target = strtolower(trim((string)($input['target'] ?? 'all')));
$url = trim((string)($input['url'] ?? '/'));

if ($body === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Message body is required.']);
    exit;
}

// Helper to query Supabase
function sbFetch(array $cfg, string $path): array {
    $url = rtrim($cfg['supabase_url'], '/') . $path;
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'apikey: ' . $cfg['supabase_secret_key'],
        'Authorization: Bearer ' . $cfg['supabase_secret_key'],
        'Accept: application/json',
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    $res = curl_exec($ch);
    curl_close($ch);
    return is_string($res) ? (json_decode($res, true) ?: []) : [];
}

// 1. Resolve recipients
$profiles = sbFetch($cfg, '/rest/v1/profiles?suspended=eq.false&select=user_id,username');
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
if (count($uniqueIds) === 0) {
    echo json_encode(['ok' => true, 'sent' => 0, 'message' => 'No matching users found for target: ' . $target]);
    exit;
}

// 2. Fetch subscriptions
$inFilter = '(' . implode(',', array_map('rawurlencode', $uniqueIds)) . ')';
$subs = sbFetch($cfg, '/rest/v1/push_subscriptions?user_id=in.' . $inFilter . '&select=id,user_id,device_endpoint,p256dh,auth_key');

$sent = 0;
$failed = 0;

if (class_exists(WebPush::class)) {
    $webPush = new WebPush([
        'VAPID' => [
            'subject' => $cfg['vapid_subject'],
            'publicKey' => $cfg['vapid_public_key'],
            'privateKey' => $cfg['vapid_private_key'],
        ],
    ], ['TTL' => 86400]);

    $payload = json_encode([
        'title' => $title,
        'body' => $body,
        'tag' => 'ai-notif-' . time(),
        'announcementId' => 'ai_' . time(),
        'url' => $url,
    ]);

    foreach ($subs as $s) {
        if (empty($s['device_endpoint']) || empty($s['p256dh']) || empty($s['auth_key'])) continue;
        $webPush->queueNotification(
            Subscription::create([
                'endpoint' => $s['device_endpoint'],
                'publicKey' => $s['p256dh'],
                'authToken' => $s['auth_key'],
            ]),
            $payload
        );
    }

    foreach ($webPush->flush() as $report) {
        if ($report->isSuccess()) {
            $sent++;
        } else {
            $failed++;
        }
    }
}

echo json_encode([
    'ok' => true,
    'sent' => $sent,
    'failed' => $failed,
    'subscriptionsCount' => count($subs),
    'targetedUsersCount' => count($uniqueIds),
    'title' => $title,
    'body' => $body,
]);

import 'package:flutter/material.dart';
import 'services/haptics.dart';

void main() {
  runApp(const HonestRepsApp());
}

class HonestRepsApp extends StatelessWidget {
  const HonestRepsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Honest Reps',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF000000),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF10E760),
          surface: Color(0xFF111114),
        ),
        useMaterial3: true,
      ),
      home: const AppShell(),
    );
  }
}

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _tabIndex = 0;
  bool _inGym = false;
  bool _hapticsEnabled = HapticService.enabled;
  int _loggedSets = 0;

  void _onTabSelect(int index) {
    if (index == _tabIndex) return;
    HapticService.selection();
    setState(() => _tabIndex = index);
  }

  void _toggleInGym(bool value) {
    HapticService.medium();
    setState(() => _inGym = value);
  }

  void _logQuickSet() {
    HapticService.success();
    setState(() => _loggedSets += 1);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Set #$_loggedSets logged with native haptics'),
        backgroundColor: const Color(0xFF1C1C22),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      _HomeScreen(
        inGym: _inGym,
        loggedSets: _loggedSets,
        onToggleInGym: _toggleInGym,
        onLogQuickSet: _logQuickSet,
      ),
      _LogsScreen(loggedSets: _loggedSets),
      _ProfileScreen(
        hapticsEnabled: _hapticsEnabled,
        onToggleHaptics: (val) {
          setState(() {
            _hapticsEnabled = val;
            HapticService.enabled = val;
          });
          if (val) HapticService.medium();
        },
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF000000),
        elevation: 0,
        title: const Text(
          'Honest Reps',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
        ),
      ),
      body: pages[_tabIndex],
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF0B0B0E),
        indicatorColor: const Color(0xFF10E760).withValues(alpha: 0.18),
        selectedIndex: _tabIndex,
        onDestinationSelected: _onTabSelect,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home, color: Color(0xFF10E760)),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.fitness_center_outlined),
            selectedIcon: Icon(Icons.fitness_center, color: Color(0xFF10E760)),
            label: 'Logs',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person, color: Color(0xFF10E760)),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}

class _HomeScreen extends StatelessWidget {
  const _HomeScreen({
    required this.inGym,
    required this.loggedSets,
    required this.onToggleInGym,
    required this.onLogQuickSet,
  });

  final bool inGym;
  final int loggedSets;
  final ValueChanged<bool> onToggleInGym;
  final VoidCallback onLogQuickSet;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _Card(
          child: SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'In the Gym',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            ),
            subtitle: Text(
              inGym ? 'Active · Native haptics enabled' : 'Tap to start session',
              style: const TextStyle(color: Color(0xFF86868B), fontSize: 12),
            ),
            activeThumbColor: const Color(0xFF10E760),
            value: inGym,
            onChanged: onToggleInGym,
          ),
        ),
        const SizedBox(height: 12),
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Quick Workout Log',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
              ),
              const SizedBox(height: 6),
              Text(
                'Sets logged today: $loggedSets',
                style: const TextStyle(color: Color(0xFF86868B), fontSize: 13),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF10E760),
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: onLogQuickSet,
                  child: const Text(
                    'Log Set (Success Haptic)',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LogsScreen extends StatelessWidget {
  const _LogsScreen({required this.loggedSets});

  final int loggedSets;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        loggedSets == 0
            ? 'No sets logged yet today.'
            : '$loggedSets set(s) logged today.',
        style: const TextStyle(color: Color(0xFF86868B), fontSize: 14),
      ),
    );
  }
}

class _ProfileScreen extends StatelessWidget {
  const _ProfileScreen({
    required this.hapticsEnabled,
    required this.onToggleHaptics,
  });

  final bool hapticsEnabled;
  final ValueChanged<bool> onToggleHaptics;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _Card(
          child: SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Haptic Feedback',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            ),
            subtitle: const Text(
              'Native iOS Taptic Engine & Android vibration',
              style: TextStyle(color: Color(0xFF86868B), fontSize: 12),
            ),
            activeThumbColor: const Color(0xFF10E760),
            value: hapticsEnabled,
            onChanged: onToggleHaptics,
          ),
        ),
        const SizedBox(height: 12),
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Test Native Haptics',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _HapticChip('Light', () => HapticService.light()),
                  _HapticChip('Medium', () => HapticService.medium()),
                  _HapticChip('Heavy', () => HapticService.heavy()),
                  _HapticChip('Selection', () => HapticService.selection()),
                  _HapticChip('Success', () => HapticService.success()),
                  _HapticChip('Warning', () => HapticService.warning()),
                  _HapticChip('Error', () => HapticService.error()),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _HapticChip extends StatelessWidget {
  const _HapticChip(this.label, this.onTap);

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: Colors.white,
        side: const BorderSide(color: Color(0xFF2C2C32)),
      ),
      onPressed: onTap,
      child: Text(label),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF111114),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: child,
    );
  }
}

"""Hardware portability regressions; all sysfs files are temporary fixtures."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

script = Path(__file__).resolve().parents[1] / 'scripts/hardware-monitor.py'
spec = importlib.util.spec_from_file_location('hardware_monitor', script)
hardware = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hardware)


class HardwareTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def device(self, path, **values):
        device = self.root / path
        device.mkdir(parents=True, exist_ok=True)
        for key, value in values.items():
            (device / key).write_text(str(value))
        return device

    def test_no_optional_hardware(self):
        result = hardware.sample(self.root, hardware.temperature_candidates(self.root))
        self.assertIsNone(result['temperature'])
        self.assertFalse(result['battery']['available'])

    def test_arbitrary_battery_names_and_energy_weighting(self):
        self.device('class/power_supply/CMB7', type='Battery', present=1, capacity=50,
                    energy_now=20, energy_full=40, status='Discharging')
        self.device('class/power_supply/secondary', type='Battery', capacity=100,
                    energy_now=60, energy_full=60, status='Full')
        self.device('class/power_supply/mouse', type='Battery', scope='Device', capacity=1)
        self.device('class/power_supply/missing', type='Battery', present=0, capacity=1)
        result = hardware.battery_state(self.root)
        self.assertEqual(result['percent'], 80)
        self.assertEqual(result['status'], 'Discharging')

    def test_charge_only_and_hot_unplug(self):
        battery = self.device('class/power_supply/BATT9', type='Battery', charge_now=500,
                              charge_full=1000, status='Charging')
        self.assertEqual(hardware.battery_state(self.root)['percent'], 50)
        (battery / 'present').write_text('0')
        self.assertFalse(hardware.battery_state(self.root)['available'])

    def test_cpu_sensor_over_gpu_and_invalid_readings(self):
        self.device('class/hwmon/hwmon0', name='amdgpu', temp1_input=90000)
        self.device('class/hwmon/hwmon7', name='k10temp', temp1_input=54000, temp1_label='Tctl')
        sensors = hardware.temperature_candidates(self.root)
        self.assertEqual(hardware.sample(self.root, sensors)['temperature'], 54)
        (self.root / 'class/hwmon/hwmon7/temp1_input').write_text('nan')
        self.assertIsNone(hardware.sample(self.root, sensors)['temperature'])

    def test_arm_thermal_zone_any_index(self):
        self.device('class/thermal/thermal_zone12', type='cpu-thermal', temp=42500)
        result = hardware.sample(self.root, hardware.temperature_candidates(self.root))
        self.assertEqual(result['temperature'], 42.5)


if __name__ == '__main__':
    unittest.main()

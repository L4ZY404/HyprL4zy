#!/usr/bin/env python3
"""Read optional Linux sensors and system batteries without device-name assumptions."""
import json
import math
import os
from pathlib import Path
import time


def read(path):
    try:
        return path.read_text().strip()
    except (OSError, UnicodeError):
        return ''


def number(path):
    try:
        value = float(read(path))
        return value if math.isfinite(value) else None
    except ValueError:
        return None


def temperature_candidates(sysfs):
    override = os.environ.get('HYPRL4ZY_TEMPERATURE_SENSOR')
    if override:
        return [(Path(override), 'Custom sensor')]
    candidates = []
    for device in sorted((sysfs / 'class/hwmon').glob('hwmon*')):
        driver = read(device / 'name').lower()
        if driver not in ('coretemp', 'k10temp', 'k8temp', 'zenpower', 'cpu_thermal', 'soc_thermal'):
            continue
        for sensor in sorted(device.glob('temp*_input')):
            label = read(sensor.with_name(sensor.name.replace('_input', '_label')))
            priority = 0 if any(token in label.lower() for token in ('package', 'tdie', 'tctl')) else 1
            candidates.append((priority, sensor, label or driver))
    if candidates:
        best = min(value[0] for value in candidates)
        return [(path, label) for priority, path, label in candidates if priority == best]
    for device in sorted((sysfs / 'class/thermal').glob('thermal_zone*')):
        label = read(device / 'type')
        if any(token in label.lower() for token in ('cpu', 'x86_pkg', 'soc')):
            candidates.append((0, device / 'temp', label))
    return [(path, label) for _, path, label in candidates]


def battery_state(sysfs):
    batteries = []
    for device in sorted((sysfs / 'class/power_supply').glob('*')):
        if read(device / 'type') != 'Battery' or read(device / 'scope') == 'Device':
            continue
        if read(device / 'present') == '0':
            continue
        percent = number(device / 'capacity')
        now, full = number(device / 'energy_now'), number(device / 'energy_full')
        if now is None or full is None or full <= 0:
            charge, capacity = number(device / 'charge_now'), number(device / 'charge_full')
            voltage = number(device / 'voltage_min_design') or number(device / 'voltage_now')
            if charge is not None and capacity and capacity > 0:
                if percent is None:
                    percent = 100 * charge / capacity
                if voltage and voltage > 0:
                    now, full = charge * voltage / 1e6, capacity * voltage / 1e6
        if percent is None and now is not None and full and full > 0:
            percent = 100 * now / full
        if percent is None or not 0 <= percent <= 100:
            continue
        batteries.append((percent, read(device / 'status') or 'Unknown', now, full))
    if not batteries:
        return {'available': False, 'percent': 0, 'status': 'Unknown'}
    if all(now is not None and full is not None and full > 0 for _, _, now, full in batteries):
        percent = 100 * sum(b[2] for b in batteries) / sum(b[3] for b in batteries)
    else:
        percent = sum(b[0] for b in batteries) / len(batteries)
    states = [b[1] for b in batteries]
    status = 'Charging' if 'Charging' in states else 'Discharging' if 'Discharging' in states else 'Full' if all(s == 'Full' for s in states) else 'Not charging'
    return {'available': True, 'percent': max(0, min(100, percent)), 'status': status}


def sample(sysfs, candidates):
    values = []
    for path, label in candidates:
        raw = number(path)
        if raw is not None and -20 <= raw / 1000 <= 150:
            values.append((raw / 1000, label))
    temperature, label = max(values) if values else (None, '')
    return {'temperature': temperature, 'temperatureSource': label, 'battery': battery_state(sysfs)}


def main():
    sysfs = Path('/sys')
    candidates = []
    tick = 0
    while True:
        if tick % 6 == 0:
            candidates = temperature_candidates(sysfs)
        print(json.dumps(sample(sysfs, candidates)), flush=True)
        tick += 1
        time.sleep(5)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Consume completed command files without spawning an idle process every tick."""
import fcntl
import os
from pathlib import Path
import sys
import time

state_home = Path(os.environ.get('XDG_STATE_HOME') or Path.home() / '.local/state')
router_dir = state_home / 'hyprl4zy'
router_dir.mkdir(parents=True, exist_ok=True)

# Only one listener may consume commands for this shell configuration.
with (router_dir / 'router.lock').open('a') as lock:
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        sys.exit(0)
    while True:
        pending = list(router_dir.glob('.router-write.*.command'))
        legacy = router_dir / 'router.command'
        if legacy.is_file():
            pending.append(legacy)
        for path in sorted(pending, key=lambda item: item.stat().st_mtime_ns):
            claimed = router_dir / f'.router-read-{os.getpid()}'
            try:
                path.replace(claimed)
                message = claimed.read_text().splitlines()
                if message and message[0].strip():
                    print(message[0].strip(), flush=True)
                claimed.unlink()
            except FileNotFoundError:
                continue
        time.sleep(0.025)

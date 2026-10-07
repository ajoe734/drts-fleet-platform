"""Actual config and Linux syscall regression; never starts a ClamAV engine."""

import errno
import os
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]
CONFIG = ROOT / "operations/artifact-scanner/clamd.conf"


def active_directives():
    # Preserve order and duplicates so an extra override cannot be hidden.
    return [tuple(line.split()) for raw in CONFIG.read_text().splitlines()
            if (line := raw.strip()) and not line.startswith("#")]


class ClamdForegroundLoggingTest(unittest.TestCase):
    def test_actual_config_keeps_foreground_output(self):
        directives = active_directives()
        self.assertEqual([d for d in directives if d[0] == "Foreground"],
                         [("Foreground", "yes")])
        self.assertEqual([d for d in directives if d[0] == "LogTime"],
                         [("LogTime", "yes")])
        self.assertEqual([d for d in directives if d[0] == "LogVerbose"],
                         [("LogVerbose", "no")])

    def test_actual_config_has_no_file_logger_or_unlock(self):
        # Reject ALL file targets, including /dev/stdout, /proc/self/fd/1,
        # /dev/null and regular writable files, rather than one bad spelling.
        self.assertEqual([d for d in active_directives()
                          if d[0] in {"LogFile", "LogFileUnlock"}], [])

    def test_all_other_directives_preserve_reviewed_bounds(self):
        # Exact active contract from reviewed 9c87585483ce35665fd52887091d0f21872e6a0f,
        # excluding ONLY the two removed file-logger directives. This also
        # rejects added log suppression, alternate listeners or limit overrides.
        self.assertEqual(
            [d for d in active_directives()
             if d[0] not in {"LogFile", "LogFileUnlock"}],
            [
                ("LogTime", "yes"), ("LogVerbose", "no"),
                ("PidFile", "/tmp/clamd.pid"), ("TemporaryDirectory", "/tmp"),
                ("DatabaseDirectory", "/var/lib/clamav"), ("SelfCheck", "1800"),
                ("TCPSocket", "3310"), ("TCPAddr", "127.0.0.1"),
                ("MaxConnectionQueueLength", "10"), ("MaxThreads", "4"),
                ("StreamMaxLength", "10M"), ("MaxFileSize", "10M"),
                ("MaxScanSize", "10M"), ("MaxRecursion", "5"),
                ("MaxFiles", "1000"), ("ReadTimeout", "60"),
                ("CommandReadTimeout", "5"), ("SendBufTimeout", "5000"),
                ("AlertExceedsMax", "yes"), ("ExitOnOOM", "yes"),
                ("Foreground", "yes"), ("User", "clamav"),
            ],
        )

    @unittest.skipUnless(hasattr(os, "O_NOFOLLOW"), "requires Linux O_NOFOLLOW")
    def test_file_logger_open_flags_reject_symlink_with_eloop(self):
        # ClamAV 1.4.6 common/output.c::logg uses these exact open flags.
        # Exercise the real syscall on test-owned files, not /dev/stdout.
        # This proves the OS boundary, not ClamAV startup or emitted logs.
        flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "inherited-output"
            link = Path(directory) / "stdout"
            fd = os.open(target, flags, 0o640)
            try:
                os.write(fd, b"regular file control\n")
            finally:
                os.close(fd)
            link.symlink_to(target)
            with self.assertRaises(OSError) as raised:
                fd = os.open(link, flags, 0o640)
                os.close(fd)  # Avoid leaking if a platform wrongly follows it.
            self.assertEqual(raised.exception.errno, errno.ELOOP)
            self.assertEqual(target.read_bytes(), b"regular file control\n")


if __name__ == "__main__":
    unittest.main()

"""Serve the immutable Expo export on a GitHub-hosted acceptance runner only."""
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class ExportHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        target = Path(super().translate_path(path))
        route = urlsplit(path).path
        if not target.exists() and not Path(route).suffix:
            html = Path(str(target) + '.html')
            return str(html if html.exists() else Path(self.directory) / 'index.html')
        return str(target)


if __name__ == '__main__':
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise SystemExit('WIRE browser server is restricted to its GitHub-hosted runner.')
    directory = Path('apps/driver-app/dist-wire').resolve()
    if not (directory / 'index.html').is_file():
        raise SystemExit('Build the candidate Expo export before serving it.')
    ThreadingHTTPServer(('127.0.0.1', 3011), partial(ExportHandler, directory=str(directory))).serve_forever()

#!/usr/bin/env python3
import http.server
import socketserver
import os
import sys

PORT = 8844
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS and disable aggressive caching for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

def main():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), CustomHandler) as httpd:
        print(f"TB2 Install Assistant server running at http://0.0.0.0:{PORT}")
        print(f"Serving files from: {DIRECTORY}")
        sys.stdout.flush()
        httpd.serve_forever()

if __name__ == "__main__":
    main()

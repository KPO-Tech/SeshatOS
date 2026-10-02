"""A small stand-in for the Drive v3 endpoints the Google Drive connector uses."""

import httpx

DOC = "application/vnd.google-apps.document"
FOLDER = "application/vnd.google-apps.folder"


def file(file_id, name, mime="text/plain", size=10, trashed=False):
    return {"id": file_id, "name": name, "mimeType": mime, "size": str(size), "trashed": trashed, "modifiedTime": "2026-10-01T10:00:00Z", "webViewLink": f"https://drive/{file_id}"}


class FakeDrive:
    """A small stand-in for the Drive v3 endpoints the connector uses."""

    def __init__(self):
        self.files = {}  # id -> metadata
        self.content = {}  # id -> text
        self.permissions = {}  # id -> list of Drive permission dicts
        self.permission_errors = {}  # id -> status
        self.pages = []  # files.list pages, each a list of ids
        self.changes = []  # change pages: {"changes": [...], "next": token|None, "new_start": token|None}
        self.start_token = "start-1"
        self.rate_limit = False
        self.users = []  # admin directory users
        self.groups = []  # admin directory groups
        self.members = {}  # group id -> list of member dicts, or an int status for an error
        self.drives = []  # shared drives
        self.folders = {}  # parent id -> list of folder metadata
        self.admin_status = None  # make the admin directory answer with this status
        self.calls = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        path, params = request.url.path, dict(request.url.params)
        self.calls.append((path, params))
        if request.headers.get("Authorization") == "Bearer expired":
            return httpx.Response(401, json={})
        if self.rate_limit:
            return httpx.Response(429, headers={"Retry-After": "7"}, json={})
        if path == "/token":
            return httpx.Response(200, json={"access_token": "fresh"})
        if path == "/drive/v3/about":
            return httpx.Response(200, json={"user": {"emailAddress": "me@example.com"}})
        if path == "/drive/v3/changes/startPageToken":
            return httpx.Response(200, json={"startPageToken": self.start_token})
        if path.startswith("/admin/directory/v1/"):
            if self.admin_status:
                return httpx.Response(self.admin_status, json={})
            if path == "/admin/directory/v1/users":
                return httpx.Response(200, json={"users": self.users})
            if path == "/admin/directory/v1/groups":
                return httpx.Response(200, json={"groups": self.groups})
            group_id = path.split("/")[5]
            outcome = self.members.get(group_id, [])
            if isinstance(outcome, int):
                return httpx.Response(outcome, json={})
            return httpx.Response(200, json={"members": outcome})
        if path == "/drive/v3/drives":
            return httpx.Response(200, json={"drives": self.drives})
        if path == "/drive/v3/files" and "in parents" in params.get("q", ""):
            parent = params["q"].split("'")[1]
            return httpx.Response(200, json={"files": self.folders.get(parent, [])})
        if path == "/drive/v3/changes":
            page = self.changes[int(params["pageToken"].removeprefix("c"))] if params["pageToken"].startswith("c") else self.changes[0]
            body = {"changes": page["changes"]}
            if page.get("next"):
                body["nextPageToken"] = page["next"]
            if page.get("new_start"):
                body["newStartPageToken"] = page["new_start"]
            return httpx.Response(200, json=body)
        if path == "/drive/v3/files":
            index = int(params.get("pageToken", "p0").removeprefix("p"))
            ids = self.pages[index]
            body = {"files": [self.files[i] for i in ids]}
            if index + 1 < len(self.pages):
                body["nextPageToken"] = f"p{index + 1}"
            return httpx.Response(200, json=body)
        parts = path.split("/")  # /drive/v3/files/{id}[/permissions|/export]
        if len(parts) >= 5 and parts[3] == "files":
            file_id = parts[4]
            if len(parts) == 6 and parts[5] == "permissions":
                if file_id in self.permission_errors:
                    return httpx.Response(self.permission_errors[file_id], json={})
                return httpx.Response(200, json={"permissions": self.permissions.get(file_id, [])})
            if len(parts) == 6 and parts[5] == "export":
                return httpx.Response(200, text=self.content[file_id])
            if params.get("alt") == "media":
                return httpx.Response(200, text=self.content[file_id])
            if file_id not in self.files:
                return httpx.Response(404, json={})
            return httpx.Response(200, json=self.files[file_id])
        return httpx.Response(404, json={})


async def collect(stream):
    return [event async for event in stream]

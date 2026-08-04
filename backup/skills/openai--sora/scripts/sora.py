#!/usr/bin/env python3
"""Sora Video Generation CLI - OpenAI Videos API"""
import argparse, os, sys, time, json, urllib.request, urllib.error

API_KEY = os.environ.get("OPENAI_API_KEY", "")
BASE_URL = "https://api.openai.com/v1/videos"

if not API_KEY:
    print("Error: OPENAI_API_KEY not set"); sys.exit(1)

def api_request(url, method="GET", data=None, is_multipart=False, boundary=None):
    headers = {"Authorization": f"Bearer {API_KEY}"}
    if is_multipart and data:
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        req = urllib.request.Request(url, data=data.encode(), headers=headers, method=method)
    elif data is not None:
        headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=headers, method=method)
    else:
        req = urllib.request.Request(url, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"API Error {e.code}: {error_body}", file=sys.stderr); sys.exit(1)

def build_multipart(fields):
    boundary = "----sora-boundary-" + str(int(time.time()))
    body = ""
    for key, value in fields.items():
        if value is not None:
            body += f"--{boundary}\r\n"
            body += f'Content-Disposition: form-data; name="{key}"\r\n\r\n'
            body += f"{value}\r\n"
    body += f"--{boundary}--\r\n"
    return body, boundary

def generate_video(args):
    fields = {"prompt": args.prompt, "model": args.model or "sora-2", "size": args.size or "1280x720", "seconds": str(args.seconds) if args.seconds else "8"}
    body, boundary = build_multipart(fields)
    print(f"Generating video...\n  Model: {fields['model']}\n  Size: {fields['size']}\n  Duration: {fields['seconds']}s\n  Prompt: {fields['prompt'][:100]}...\n")
    result = api_request(BASE_URL, method="POST", data=body, is_multipart=True, boundary=boundary)
    print(f"Video ID: {result['id']}\nStatus: {result['status']}\n")
    if args.wait:
        return poll_video(result['id'], auto_download=args.output)
    print(f"To check: python sora.py poll {result['id']}")
    print(f"To download: python sora.py download {result['id']} --output video.mp4")
    return result

def poll_video(video_id, interval=10, timeout=600, auto_download=None):
    print(f"Polling video {video_id}...")
    elapsed = 0
    while elapsed < timeout:
        result = api_request(f"{BASE_URL}/{video_id}")
        status = result.get("status", "unknown")
        progress = result.get("progress", 0)
        print(f"  [{elapsed}s] Status: {status} | Progress: {progress}%")
        if status == "completed":
            print(f"\n✅ Video completed!\n  ID: {result['id']}")
            if auto_download:
                download_video(video_id, auto_download)
            else:
                print(f"  Download: python sora.py download {video_id} --output video.mp4")
            return result
        if status == "failed":
            print(f"\n❌ Failed: {result.get('error', 'Unknown')}"); sys.exit(1)
        time.sleep(interval); elapsed += interval
    print(f"\n⏰ Timeout after {timeout}s"); sys.exit(1)

def download_video(video_id, output_path):
    print(f"Downloading video {video_id} to {output_path}...")
    headers = {"Authorization": f"Bearer {API_KEY}"}
    req = urllib.request.Request(f"{BASE_URL}/{video_id}/content", headers=headers, method="GET")
    try:
        resp = urllib.request.urlopen(req)
        video_data = resp.read()
        with open(output_path, "wb") as f: f.write(video_data)
        size_mb = len(video_data) / (1024 * 1024)
        print(f"✅ Downloaded: {output_path} ({size_mb:.1f} MB)")
        return output_path
    except urllib.error.HTTPError as e:
        print(f"Download error {e.code}: {e.read().decode()}", file=sys.stderr); sys.exit(1)

def list_videos():
    result = api_request(BASE_URL)
    if isinstance(result, dict) and "data" in result:
        videos = result["data"]
        print(f"Found {len(videos)} videos:\n")
        for v in videos:
            print(f"  ID: {v['id']} | Status: {v.get('status','N/A')} | Model: {v.get('model','N/A')}")
    else:
        print(json.dumps(result, indent=2))

def main():
    parser = argparse.ArgumentParser(description="Sora Video Generation CLI")
    subparsers = parser.add_subparsers(dest="command")
    gen = subparsers.add_parser("generate")
    gen.add_argument("prompt")
    gen.add_argument("--model", default=None)
    gen.add_argument("--size", default=None)
    gen.add_argument("--seconds", type=int, default=None)
    gen.add_argument("--wait", action="store_true")
    gen.add_argument("--output", default=None)
    poll = subparsers.add_parser("poll")
    poll.add_argument("video_id")
    dl = subparsers.add_parser("download")
    dl.add_argument("video_id")
    dl.add_argument("--output", default="video.mp4")
    subparsers.add_parser("list")
    args = parser.parse_args()
    if args.command == "generate": generate_video(args)
    elif args.command == "poll": poll_video(args.video_id)
    elif args.command == "download": download_video(args.video_id, args.output)
    elif args.command == "list": list_videos()
    else: parser.print_help()

if __name__ == "__main__":
    main()

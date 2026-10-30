import os
from PIL import Image
import requests
from io import BytesIO

def download_icon(url, save_path, name):
    if os.path.exists(save_path):
        print(f"Skipping {name}, already exists.")
        return
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            img = Image.open(BytesIO(response.content))
            img.save(save_path, "PNG")
            print(f"Saved {name} to {save_path}")
        else:
            print(f"Failed to download {name}: {response.status_code}")
    except Exception as e:
        print(f"Error downloading {name}: {e}")

sites = [
    ("https://www.amazon.com/favicon.ico", "amazon.png"),
    ("https://static.twitchcdn.net/assets/favicon-32-d6025c14e9008bc5d29d.png", "twitch.png"),
    ("https://www.cloudflare.com/favicon.ico", "cloudflare.png")
]

base_path_cn = r"g:\tttttttteeeeeeaaaaaaaammmmmmyuyuyuyuyuyuyuyumaomaomaomaomao\pc-tool\cn.pc-tool.cn\assets\sites"
base_path_en = r"g:\tttttttteeeeeeaaaaaaaammmmmmyuyuyuyuyuyuyuyumaomaomaomaomao\pc-tool\en.pc-tool.cn\assets\sites"

os.makedirs(base_path_cn, exist_ok=True)
os.makedirs(base_path_en, exist_ok=True)

for url, name in sites:
    download_icon(url, os.path.join(base_path_cn, name), name)
    download_icon(url, os.path.join(base_path_en, name), name)

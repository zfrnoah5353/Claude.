#!/usr/bin/env python3
"""Fabrique la version web / téléphone (dossier mobile/) à partir de web/ :
page sans squelette HTML, CSS intégré, données JSON décompressées."""
import gzip, os, re, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, M = os.path.join(ROOT, 'web'), os.path.join(ROOT, 'mobile')
shutil.rmtree(M, ignore_errors=True)
os.makedirs(os.path.join(M, 'data'))
shutil.copytree(os.path.join(W, 'js'), os.path.join(M, 'js'))
shutil.copytree(os.path.join(W, 'vendor'), os.path.join(M, 'vendor'))
for f in os.listdir(os.path.join(W, 'data')):
    with gzip.open(os.path.join(W, 'data', f)) as src, open(os.path.join(M, 'data', f[:-3]), 'wb') as dst:
        dst.write(src.read())
html = open(os.path.join(W, 'index.html'), encoding='utf-8').read()
css = open(os.path.join(W, 'app.css'), encoding='utf-8').read()
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
importmap = re.search(r'<script type="importmap">.*?</script>', html, re.S).group(0)
page = '<title>SetupForge</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>\n' + css + '</style>\n' + importmap + body
open(os.path.join(M, 'index.html'), 'w', encoding='utf-8').write(page)
print('mobile/ prêt :', sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(M) for f in fs) // 1024, 'Ko')

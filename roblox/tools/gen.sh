#!/bin/sh
# Prépare une copie de Config utilisable hors de Roblox (doublures Color3/Vector3)
cd "$(dirname "$0")"
mkdir -p _gen
{ echo 'local __s = require("../stubs") local Color3, Vector3 = __s.Color3, __s.Vector3'; cat ../src/shared/Config.luau; } > _gen/Config.luau

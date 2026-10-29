#!/usr/bin/env python3
import json
import pathlib
import sys
import zipfile

MAX_FILES = 256
MAX_TOTAL_BYTES = 64 * 1024 * 1024
MAX_SHADER_BYTES = 1024 * 1024


def archive(source, target):
    source = pathlib.Path(source).resolve()
    target = pathlib.Path(target).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as output:
        for item in sorted(source.rglob("*")):
            if item.is_symlink():
                raise ValueError("Package source contains a symlink: " + str(item))
            if item.is_file():
                output.write(item, item.relative_to(source).as_posix())


def validate(file):
    with zipfile.ZipFile(file) as package:
        infos = package.infolist()
        if len(infos) > MAX_FILES:
            raise ValueError("Package contains too many files")
        names = set()
        file_names = set()
        archive_paths = []
        total = 0
        for info in infos:
            name = info.filename
            canonical = name.rstrip("/")
            path = pathlib.PurePosixPath(canonical)
            if (not canonical or "\\" in name or ":" in name or path.is_absolute()
                    or ".." in path.parts or path.as_posix() != canonical or canonical in names):
                raise ValueError("Rejected package path: " + name)
            names.add(canonical)
            archive_paths.append(name)
            if not info.is_dir():
                file_names.add(canonical)
            total += info.file_size
            if total > MAX_TOTAL_BYTES:
                raise ValueError("Package exceeds the uncompressed size limit")
        if "app.json" not in file_names:
            raise ValueError("Missing app.json")
        manifest = json.loads(package.read("app.json"))
        if manifest.get("format") != "hblauncher.gpu-app" or manifest.get("abi") != 1:
            raise ValueError("Unsupported GPU app format or ABI")
        required = [manifest.get("icon"), manifest.get("initialState"), manifest.get("data")]
        required.extend((manifest.get("shaders") or {}).values())
        if manifest.get("computeSequence"):
            required.extend((manifest["computeSequence"].get("begin"),
                             manifest["computeSequence"].get("after")))
        memory_initial = (manifest.get("memory") or {}).get("initial")
        if memory_initial:
            required.append(memory_initial)
        required.extend((manifest.get("audio") or {}).get("effects", {}).values())
        for name in required:
            if not isinstance(name, str) or not name or name not in file_names:
                raise ValueError("Package is missing a required app file: " + str(name))
            if name.endswith(".spv") and package.getinfo(name).file_size > MAX_SHADER_BYTES:
                raise ValueError("Shader exceeds the package size limit: " + name)
        return {
            "format": manifest["format"],
            "abi": manifest["abi"],
            "id": manifest.get("id", ""),
            "name": manifest.get("name", ""),
            "version": manifest.get("version", ""),
            "files": len(infos),
            "paths": sorted(archive_paths),
        }


def extract(file, target):
    target = pathlib.Path(target).resolve()
    info = validate(file)
    if target.exists():
        raise ValueError("Extraction target already exists: " + str(target))
    target.mkdir(parents=True)
    with zipfile.ZipFile(file) as package:
        for name in info["paths"]:
            destination = (target / pathlib.PurePosixPath(name)).resolve()
            if target not in destination.parents:
                raise ValueError("Rejected package path: " + name)
            if name.endswith("/"):
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(package.read(name))


def main(argv):
    if len(argv) == 4 and argv[1] == "create":
        archive(argv[2], argv[3])
        return
    if len(argv) == 3 and argv[1] == "validate":
        print(json.dumps(validate(argv[2])))
        return
    if len(argv) == 4 and argv[1] == "extract":
        extract(argv[2], argv[3])
        return
    raise ValueError("Usage: package.py create DIR FILE | validate FILE | extract FILE DIR")


if __name__ == "__main__":
    try:
        main(sys.argv)
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
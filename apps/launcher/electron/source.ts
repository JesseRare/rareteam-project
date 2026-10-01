import { spawn } from "node:child_process";
import { cp, lstat, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

function assertServerAddress(value: string) {
  if (!/^[A-Za-z0-9.-]+:\d{1,5}$/.test(value)) throw new Error("Invalid Source server address");
  const port = Number(value.slice(value.lastIndexOf(":") + 1));
  if (port < 1 || port > 65535) throw new Error("Invalid Source server port");
  return value;
}

async function rejectSymlinkedManagedPaths(clientRoot: string) {
  for (const relative of ["cstrike", "cstrike/resource", "cstrike/cfg", "cstrike/materials", "cstrike/materials/console"]) {
    try {
      if ((await lstat(path.join(clientRoot, relative))).isSymbolicLink()) {
        throw new Error(`Небезопасная ссылка в папке клиента: ${relative}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export async function launchSourceGame(clientRoot: string, themeRoot: string, serverAddress: string) {
  if (process.platform !== "win32") throw new Error("CSS v34 сейчас поддерживается только на Windows");
  if (!path.isAbsolute(clientRoot)) throw new Error("Выберите папку клиента CSS v34");
  const executable = path.join(clientRoot, "hl2.exe");
  const gameDirectory = path.join(clientRoot, "cstrike");
  try {
    if (!(await stat(executable)).isFile() || !(await stat(gameDirectory)).isDirectory()) throw new Error();
  } catch {
    throw new Error("В выбранной папке не найдены hl2.exe и cstrike");
  }
  await rejectSymlinkedManagedPaths(clientRoot);
  await cp(themeRoot, clientRoot, { recursive: true, force: true });
  const menuPath = path.join(clientRoot, "cstrike", "resource", "GameMenu.res");
  const menu = await readFile(menuPath, "utf8");
  await writeFile(menuPath, menu.replaceAll("{{SERVER_ADDRESS}}", assertServerAddress(serverAddress)), { mode: 0o644 });
  const child = spawn(executable, [
    "-game", "cstrike",
    "+exec", "rareteam.cfg",
  ], { cwd: clientRoot, detached: true, stdio: "ignore" });
  child.unref();
  return { pid: child.pid ?? 0 };
}

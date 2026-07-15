import { spawn } from 'child_process';
import { platform } from 'process';

const args = process.argv.slice(2);

let cmd, cmdArgs, opts;

if (platform === 'linux') {
  const env = {
    ...process.env,
    GDK_BACKEND: 'x11',
    LIBGL_ALWAYS_SOFTWARE: '1',
    WEBKIT_DISABLE_COMPOSITING_MODE: '1',
    GSETTINGS_SCHEMA_DIR: '/usr/share/glib-2.0/schemas',
  };
  for (const key of [
    'GTK_PATH', 'GTK_EXE_PREFIX', 'GTK_IM_MODULE_FILE',
    'GDK_PIXBUF_MODULEDIR', 'GDK_PIXBUF_MODULE_FILE', 'GIO_MODULE_DIR',
  ]) {
    delete env[key];
  }
  cmd = 'tauri';
  cmdArgs = args;
  opts = { stdio: 'inherit', env };
} else {
  // Windows and macOS: run tauri directly, no GTK/GDK vars needed
  cmd = 'tauri';
  cmdArgs = args;
  // .cmd files on Windows require shell:true to spawn correctly
  opts = { stdio: 'inherit', shell: platform === 'win32' };
}

const child = spawn(cmd, cmdArgs, opts);
child.on('exit', code => process.exit(code ?? 0));

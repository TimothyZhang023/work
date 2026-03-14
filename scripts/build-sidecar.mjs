import { execSync } from 'node:child_process';
import { copyFileSync, writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const tauriDir = join(rootDir, 'src-tauri');
const sidecarDir = join(tauriDir, 'sidecar');

function run(command) {
    console.log(`Running: ${command}`);
    execSync(command, { stdio: 'inherit', cwd: rootDir });
}

async function build() {
    // 1. Ensure sidecar directory exists
    if (!existsSync(sidecarDir)) {
        mkdirSync(sidecarDir, { recursive: true });
    }

    // 2. Build the server using ncc (bundle everything into a single CJS file)
    console.log('Bundling server with ncc...');
    run('npx ncc build server.js -o dist-server -m');
    // Move the bundled file to a predictable name
    copyFileSync(join(rootDir, 'dist-server', 'index.js'), join(rootDir, 'dist-server.cjs'));

    // 3. Generate SEA blob
    console.log('Generating SEA blob...');
    run('node --experimental-sea-config sea-config.json');

    // 4. Create the executable by copying the node binary
    const nodePath = process.execPath;
    const targetTriple = execSync('rustc -Vv | grep host | cut -d " " -f 2', { encoding: 'utf8' }).trim();
    const binaryName = `workhorse-server-${targetTriple}${process.platform === 'win32' ? '.exe' : ''}`;
    const outputPath = join(sidecarDir, binaryName);

    console.log(`Creating sidecar binary: ${binaryName}`);
    copyFileSync(nodePath, outputPath);

    // 5. Inject the blob into the binary
    // Note: On macOS, we might need to use postject or similar if not using native support
    // For Node 20+, we use 'npx postject' or the built-in mechanism if available.
    // However, the simplest cross-platform way for SEA is currently postject.
    console.log('Injecting SEA blob...');
    run(`npx postject ${outputPath} NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_f14658410194511a1228e3d92fb9b00c ${process.platform === 'darwin' ? '--macho-segment-name NODE_SEA' : ''}`);

    if (process.platform !== 'win32') {
        chmodSync(outputPath, 0o755);
    }

    console.log('Sidecar build complete!');
}

build().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});

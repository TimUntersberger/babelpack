#!/usr/bin/env node

const babel = require("@babel/core");
const path = require("path");
const fs = require("fs-extra");
const chalk = require("chalk").default;
const which = require("which");
const { spawn } = require("child_process");
const chokidar = require("chokidar");
const prog = require("commander");

prog
  .version("1.0.0")
  .option(
    "-d, --out-dir [path]",
    "The relative path to the directory where the transformed files get saved"
  )
  .option("-f --file [path]", "The relative path to the source file")
  .option(
    "-D, --delete-dist",
    "Delete the out folder before transforming the files"
  )
  .option(
    "-s, --src-dir [path]",
    "The relative path to the directory where the to be transformed files are located"
  )
  .option(
    "-r, --root-file [name]",
    "The name of the file which will be executed after each transform"
  )
  .option(
    "-c, --console-refresh-disabled",
    "Don't clear the screen after every compilation"
  )
  .parse(process.argv);

if (prog.srcDir && prog.file) {
  console.log(
    `${chalk.red("ERROR:")} You can only specify either --file or --src-dir!`
  );
}

const srcFile = path.join(process.cwd(), prog.file || "null");
const srcDir = path.join(process.cwd(), prog.srcDir || "src");
const outDir = path.join(process.cwd(), prog.outDir || "dist");
const rootFile = path.join(outDir, prog.rootFile || "index.js");

let nodeProcess = null;
let nodeLocation = which.sync("node");

if (prog.deleteDist) {
  fs.removeSync(outDir);
}

if (!fs.existsSync(srcDir)) {
  console.log(
    `${chalk.red("ERROR:")} Directory ${chalk.bold(srcDir)} doesn't exist!`
  );
  return;
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}

const log = message => {
  if (!prog.consoleRefreshDisabled) process.stdout.write("\x1Bc");
  console.log(
    `${chalk.green(`[${new Date().toISOString()}]:`)} ${chalk.white(message)}`
  );
};

function startProg() {
  if (!fs.existsSync(rootFile)) {
    console.log(
      `${chalk.red("ERROR:")} File ${chalk.bold(rootFile)} doesn't exist!`
    );
    process.exit(0);
  }
  nodeProcess = spawn(nodeLocation, [rootFile]);
  nodeProcess.stdout.pipe(process.stdout);
  nodeProcess.stderr.pipe(process.stderr);
  process.stdin.pipe(nodeProcess.stdin);
}

function convertSrcPathToOutPath(filePath) {
  return prog.file
    ? path.join(outDir, path.basename(srcFile).replace(/.tsc?/, ".js"))
    : path.join(outDir, filePath.replace(srcDir, "")).replace(/\.tsx?/, ".js");
}

function createDirectories(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  } catch (error) {
    createDirectories(path.dirname(dir));
  }
}

async function transformFile(filePath) {
  return new Promise((resolve, reject) => {
    const buffer = fs.readFileSync(filePath);
    const outPath = convertSrcPathToOutPath(filePath);
    let transformedCode = null;
    try {
      transformedCode = babel.transform(buffer, { filename: filePath }).code;
    } catch (error) {
      reject(error);
    }
    if (transformedCode) {
      try {
        fs.writeFileSync(outPath, transformedCode);
      } catch (error) {
        createDirectories(path.dirname(outPath));
        fs.writeFileSync(outPath, transformedCode);
      }
      resolve();
    }
  });
}

function restart(filePath, reason) {
  if (nodeProcess) nodeProcess.kill();
  log(`${filePath.replace(srcDir, "")} ${reason}`);
  transformFile(filePath)
    .then(startProg)
    .catch(err => {
      console.log(err.message);
    });
}

let isReady = false;
let error = false;
let compiledFilesCount = 0;
const watchPath = path.join(srcDir, "/**/*.(js|jsx|ts|tsx)");

chokidar
  .watch(watchPath, {
    encoding: "utf8",
    ignored: "node_modules/**/*"
  })
  .on("add", filePath => {
    if (isReady) {
      restart(filePath, chalk.bgGreen("created"));
    } else {
      compiledFilesCount++;
      transformFile(filePath).catch(err => {
        log("Initial compilation failed");
        console.log(err.message);
        error = true;
      });
    }
  })
  .on("ready", () => {
    if (!error) {
      log(`Successfully compiled ${compiledFilesCount} files`);
      isReady = true;
      startProg();
    } else error = false;
  })
  .on("change", filePath => {
    restart(filePath, chalk.bgYellow("changed"));
  })
  .on("unlink", filePath => {
    restart(filePath, chalk.bgRed("removed"));
  });

const babel = require("@babel/core");
const path = require("path");
const fs = require("fs").promises;
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

const srcDir = prog.srcDir || "src";
const outDir = prog.outDir || "dist";
const rootFile = prog.rootFile || "index.js";

let nodeProcess = null;
let nodeLocation = which.sync("node");

const log = message => {
  if (!prog.consoleRefreshDisabled) process.stdout.write("\x1Bc");
  console.log(
    `${chalk.green(`[${new Date().toISOString()}]:`)} ${chalk.white(message)}`
  );
};

function startProg() {
  nodeProcess = spawn(nodeLocation, [path.join(outDir, rootFile)]);
  nodeProcess.stdout.pipe(process.stdout);
  nodeProcess.stderr.pipe(process.stderr);
  process.stdin.pipe(nodeProcess.stdin);
}

function convertSrcPathToOutPath(filePath) {
  return filePath.replace(srcDir, outDir).replace(/\.tsx?/, ".js");
}

async function transformFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return fs.writeFile(
    convertSrcPathToOutPath(filePath),
    babel.transform(buffer, { filename: filePath }).code
  );
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

chokidar
  .watch(srcDir, {
    encoding: "utf8"
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

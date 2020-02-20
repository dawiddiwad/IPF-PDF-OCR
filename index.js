//----------settings:-----------//
const filesPath = './pdf-files/';
const pdfZoomLvl = 3; //determines document OCR scan resolution, higher is better but takes longer to scan 
const workersAmount = 2; //10-15 is probably max for default node heap of ~1.7gb, alloc can be manually ovd using node flag --max-old-space-size
const pdfContrNumRgx = /(?<=wy:\s)[0-9]*/gm;
const filenameContrNumRgx = /[0-9][^.]*/g;
//------------------------------//

const pdfjsLib = require('pdfjs-dist');
const Tesseract = require('tesseract.js');
const Canvas = require("canvas");
const assert = require("assert").strict;
const fs = require("fs");
const path = require('path');
const async = require('async');
const readline = require('readline');

let pdfFiles;
let scheduler;
let workers = [];

logger = {
  failed: [],
  passed: [],
  logJobResult: function (passed, data) {
    if (passed) {
      this.passed.push(data);
    } else {
      this.failed.push(data);
    }
    readline.clearLine(process.stdout, 0)
    readline.cursorTo(process.stdout, 0)
    process.stdout.write(`| failed: ${this.failed.length} | passed: ${this.passed.length} | total: ${pdfFiles.length} |`);
  },
  logFailed: function () {
    console.log('\nFAILED ITEMS:');
    for (const fail of this.failed) {
      console.log(fail);
    }
  },
  logPassed: function () {
    console.log('\nPASSED ITEMS:');
    for (const pass of this.passed) {
      console.log(pass);
    }
  }
}

async function cleanup() {
  for (let worker of workers) {
    await worker.terminate();
  }
  await scheduler.terminate();
  try {
    await fs.unlinkSync('./pol.traineddata')
  } catch (e) { };
  logger.logFailed();
  logger.logPassed();
}

async function initScheduler() {
  scheduler = await Tesseract.createScheduler();
  let workerJobs = [];
  for (let i = 0; i < workersAmount; i++) {
    workerJobs.push(async function () {
      let worker = await Tesseract.createWorker();
      await worker.load();
      await worker.loadLanguage('pol');
      await worker.initialize('pol');
      await scheduler.addWorker(worker);
      workers.push(worker);
    })
  }
  console.log(`adding ${workerJobs.length} workers...`);
  try {
    await fs.unlinkSync('./pol.traineddata')
  } catch (e) { };
  await async.parallel(workerJobs);
}

async function fetchDir() {
  let filesNamesInDir = await fs.readdirSync(filesPath).filter(function (e) {
    return path.extname(e).toLowerCase() === '.pdf';
  });
  pdfFiles = [];
  for (let fileName of filesNamesInDir) {
    pdfFiles.push(filesPath + fileName);
  }
}

async function scrapPdfContent(fileName) {
  let pdf = await pdfjsLib.getDocument(fileName).promise;
  let page = await pdf.getPage(1);
  let viewport = page.getViewport({
    scale: pdfZoomLvl
  });
  viewport.transform = [pdfZoomLvl, 0, 0, -pdfZoomLvl, -viewport.width / 2.5, viewport.height];
  let canvasFactory = new NodeCanvasFactory();
  let canvasAndContext = canvasFactory.create(
    viewport.width / 2,
    viewport.height / 5,
  );
  let renderContext = {
    canvasContext: canvasAndContext.context,
    viewport: viewport,
    canvasFactory: canvasFactory,
  };

  await page.render(renderContext).promise;
  let image = canvasAndContext.canvas.toBuffer();
  const {data: {text}} = await scheduler.addJob('recognize', image);
  const contrNumFromFilename = fileName.match(filenameContrNumRgx) ? fileName.match(filenameContrNumRgx)[0] : 'no regex match';
  const contrNumFromFile = text.match(pdfContrNumRgx) ? text.match(pdfContrNumRgx)[0] : 'no regex match';
  if (contrNumFromFilename == contrNumFromFile) {
    logger.logJobResult(true, `contract match for: ${fileName} (filename|file) ${contrNumFromFilename}|${contrNumFromFile}`);
  } else {
    logger.logJobResult(false, `contract numbers do not match for: ${fileName} (filename|file) ${contrNumFromFilename}|${contrNumFromFile}`);
  }
}

function NodeCanvasFactory() { }
NodeCanvasFactory.prototype = {
  create: function NodeCanvasFactory_create(width, height) {
    assert(width > 0 && height > 0, 'Invalid canvas size');
    let canvas = Canvas.createCanvas(width, height);
    let context = canvas.getContext('2d');
    return {
      canvas: canvas,
      context: context,
    };
  },

  reset: function NodeCanvasFactory_reset(canvasAndContext, width, height) {
    assert(canvasAndContext.canvas, 'Canvas is not specified');
    assert(width > 0 && height > 0, 'Invalid canvas size');
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  },

  destroy: function NodeCanvasFactory_destroy(canvasAndContext) {
    assert(canvasAndContext.canvas, 'Canvas is not specified');
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  },
};

async function analyzeFiles() {
  await fetchDir();
  await initScheduler();
  let anaylyzeJobs = [];
  for (let fileName of pdfFiles) {
    anaylyzeJobs.push(async function () {
      await scrapPdfContent(fileName);
    })
  }
  await async.parallel(anaylyzeJobs);
  await cleanup();
}

analyzeFiles();
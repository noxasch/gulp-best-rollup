/* eslint-disable no-param-reassign */
/* eslint-disable global-require */
/* eslint-disable no-unused-vars */
/* eslint-disable no-console */
const { Transform } = require('stream');
const File = require('vinyl');
const PluginError = require('plugin-error');
const path = require('path');
const applySourceMap = require('vinyl-sourcemaps-apply');
const camelCase = require('lodash.camelcase');

const PLUGIN_NAME = 'gulp-best-rollup';
let rollup = null;
try {
  rollup = require('rollup');
} catch (err) {
  console.error('ROLLUP NOT FOUND');
  console.warn(`${PLUGIN_NAME} doesn't include rollup out of the box anymore.\
 You need to install your own rollup. Version 1.0.0 or higher.`);
}

// map object storing rollup cache objects for each input file
const rollupCache = {};

function parseBundles(arg) {
  if (typeof arg === 'string') return [{ format: arg }];
  if (arg instanceof Array) return arg;
  return [arg];
}

function assignCertainProperties(toObject, fromObject, properties = []) {
  properties.forEach((prop) => {
    if (toObject[prop] === undefined && fromObject[prop] !== undefined) {
      toObject[prop] = fromObject[prop];
    }
  });
  // for (const key of properties) {
  //   if (toObject[key] === undefined && fromObject[key] !== undefined) toObject[key] = fromObject[key];
  // }
}

// transformer class
class GulpRollup extends Transform {
  // eslint-disable-next-line consistent-return
  _transform(file, _, cb) {
    // cannot handle empty or unavailable files
    if (file.isNull()) return cb(null, file);

    // cannot handle streams
    if (file.isStream()) {
      return cb(new PluginError(PLUGIN_NAME, 'Streaming not supported'));
    }

    let inputOptions = {};
    let bundleList = [];
    if (this.arg2) {
      inputOptions = { ...this.arg1 };
      bundleList = parseBundles(this.arg2);
    } else {
      inputOptions = {};
      bundleList = parseBundles(this.arg1);
    }

    // user should not specify the input file path, but let him if he insists for some reason
    if (inputOptions.input === undefined) {
    // determine input from file filename
      inputOptions.input = path.relative(file.cwd, file.path);
    } else {
    // rename file if input is given
      file.path = path.join(file.cwd, inputOptions.input);
    }

    // caching is enabled by default because of the nature of gulp and the watching/recompilatin
    // but can be disabled by setting 'cache' to false
    if (inputOptions.cache !== false) {
      inputOptions.cache = rollupCache[inputOptions.input] || null;
    }

    // enable sourcemap is gulp-sourcemaps plugin is enabled
    const createSourceMap = file.sourceMap !== undefined;

    const originalCwd = file.cwd;
    const originalPath = file.path;
    const moduleName = camelCase(path.basename(file.path,
      path.extname(file.path)));

    function generateAndApplyBundle(bundle, outputOptions, targetFile) {
      // Sugaring the API by copying convinience objects and properties from inputOptions
      // to outputOptions (if not defined)
      // Directly copied from https://rollupjs.org/guide/en#outputoptions
      const propsToCopy = [
        // core options
        'dir', 'file', 'format', 'globals', /* 'name', */
        // advanced options
        'assetFileNames',
        'banner',
        'chunkFileNames',
        'compact',
        'entryFileNames',
        'extend',
        'footer',
        'interop',
        'intro',
        'outro',
        'paths',
        'sourcemap',
        'sourcemapExcludeSources',
        'sourcemapFile',
        'sourcemapPathTransform',
        // danger zone
        /* 'amd', */
        'esModule',
        'exports',
        'freeze',
        'indent',
        'namespaceToStringTag',
        'noConflict',
        'preferConst',
        'strict',
      ];
      assignCertainProperties(outputOptions, inputOptions, propsToCopy);
      // Rollup won't bundle iife and umd modules without module name.
      // But it won't say anything either, leaving a space for confusion
      if (outputOptions.name === undefined) {
        outputOptions.name = inputOptions.name || moduleName;
      }
      // eslint-disable-next-line max-len
      if (outputOptions.amd === undefined || outputOptions.amd.id === undefined) {
        outputOptions.amd = { ...outputOptions.amd, id: outputOptions.name };
      }
      outputOptions.sourcemap = createSourceMap;
      // generate bundle according to given or autocompleted options
      return bundle.generate(outputOptions).then((result) => {
        if (result === undefined) return;
        const output = result.output[0];
        // Pass sourcemap content and metadata to gulp-sourcemaps plugin to handle
        // destination (and custom name) was given, possibly multiple output bundles.
        if (createSourceMap) {
          output.map.file = path.relative(originalCwd, originalPath);
          output.map.sources = output.map.sources.map(
            (source) => path.relative(originalCwd, source),
          );
        }
        // return bundled file as buffer
        targetFile.contents = Buffer.from(output.code);
        // apply sourcemap to output file
        if (createSourceMap) applySourceMap(targetFile, output.map);
      });
    }
    const createBundle = (bundle, originOutputOptions, injectNewFile) => {
      // prevent modifying outputOption to affect other bundle
      const outputOptions = { ...originOutputOptions };
      // custom output name might be set
      if (outputOptions.file) {
        // setup filename name from outputOptions.file
        const newFileName = path.basename(outputOptions.file);
        const newFilePath = path.join(file.base, newFileName);
        if (injectNewFile) {
          // create new file and inject it into stream if needed (in case of multiple outputs)
          const newFile = new File({
            cwd: file.cwd,
            base: file.base,
            path: newFilePath,
            stat: {
              isFile: () => true,
              isDirectory: () => false,
              isBlockDevice: () => false,
              isCharacterDevice: () => false,
              isSymbolicLink: () => false,
              isFIFO: () => false,
              isSocket: () => false,
            },
          });
          return generateAndApplyBundle(
            bundle, outputOptions, newFile,
          )
            .then((result) => {
              this.push(newFile);
              return result;
            });
        }
        // rename original file
        file.path = newFilePath;
        return generateAndApplyBundle(bundle, outputOptions, file);
      }
      // file wasnt renamed nor new one was created,
      // apply data and sourcemaps to the original file
      return generateAndApplyBundle(bundle, outputOptions, file);
    };

    // custom rollup can be provided inside the config object
    rollup = inputOptions.rollup || rollup;
    delete inputOptions.rollup;
    rollup
    // pass basic options to rollup
      .rollup(inputOptions)
    // after the magic is done, configure the output format
      .then((bundle) => {
        // cache rollup object if caching is enabled
        if (inputOptions.cache !== false) {
          rollupCache[inputOptions.input] = bundle;
        }
        // generate ouput according to (each of) given outputOptions
        return Promise.all(bundleList.map(
          (outputOptions, i) => createBundle(bundle, outputOptions, i),
        ));
      })
    // pass file to gulp and end stream
      .then(() => cb(null, file))
      .catch((err) => {
        if (inputOptions.cache !== false) {
          rollupCache[inputOptions.input] = null;
        }
        process.nextTick(() => {
          this.emit('error', new PluginError(PLUGIN_NAME, err));
          cb(null, file);
        });
      });
  }
}

// first argument (inputOptions) is optional
module.exports = function factory(arg1, arg2) {
  // instantiate the stream class
  const stream = new GulpRollup({ objectMode: true });
  // pass in options objects
  stream.arg1 = arg1;
  stream.arg2 = arg2;
  // return the stream instance
  return stream;
};

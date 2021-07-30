/* eslint-disable no-unused-expressions */
/* eslint-disable import/no-extraneous-dependencies */
const path = require('path');
const should = require('should');
const File = require('vinyl');
const sourceMaps = require('gulp-sourcemaps');
const rollup = require('..');

const cwd = process.cwd();
const fixtureDir = path.join(__dirname, 'fixture');

function fileFactory(filename) {
  return new File({
    cwd: cwd,
    base: fixtureDir,
    path: path.join(fixtureDir, filename),
    contents: Buffer.from('dumy content not used by gulp'),
  });
}

describe('gulp-better-rollup', () => {
  it('should pass file when it isNull()', (done) => {
    const stream = rollup();
    const emptyFile = {
      isNull: () => true,
    };
    stream.once('data', (data) => {
      data.should.equal(emptyFile);
      done();
    });
    stream.write(emptyFile);
    stream.end();
  });

  it('should emit error when file isStream()', (done) => {
    const stream = rollup();
    const streamFile = {
      isNull: () => false,
      isStream: () => true,
    };
    stream.once('error', (err) => {
      err.message.should.equal('Streaming not supported');
      done();
    });
    stream.write(streamFile);
    stream.end();
  });

  it('should bundle es format using Rollup', (done) => {
    const stream = rollup('es');

    stream.once('data', (data) => {
      const result = data.contents.toString().replace(/\n/gm, '').trim();
      result.should.equal('const something = \'doge\';console.log(something);');
      done();
    });

    stream.write(fileFactory('app.js'));

    stream.end();
  });

  it('should bundle multiple formats using Rollup', (done) => {
    const stream = rollup([{
      file: 'output1.mjs',
      format: 'es',
    }, {
      file: 'output2.js',
      format: 'cjs',
    }]);

    let files = 0;
    const filenames = ['output1.mjs', 'output2.js'];
    stream.on('data', (data) => {
      const filename = path.relative(data.base, data.path);
      filenames.should.containEql(filename);
      files += 1;
    });
    stream.on('end', (data) => {
      files.should.eql(2);
      done();
    });

    stream.write(fileFactory('app.js'));

    stream.end();
  });

  it('should bundle umd format with autodetected module name', (done) => {
    const stream = rollup({
      format: 'umd',
    });

    stream.once('data', (data) => {
      const result = data.contents.toString().trim();
      should(result.startsWith('(function')).ok;
      should(result.includes('define(\'util')).ok;
      should(result.includes('global.util = global.util || {}')).ok;
      done();
    });

    stream.write(fileFactory('util.js'));

    stream.end();
  });

  it('should not create sourceMaps without gulp-sourcemaps', (done) => {
    const stream = rollup('umd');

    stream.once('data', (data) => {
      should.not.exist(data.sourceMap);
      done();
    });

    stream.write(fileFactory('util.js'));

    stream.end();
  });

  it('should create sourceMaps by default', (done) => {
    const init = sourceMaps.init();
    const write = sourceMaps.write();

    const stream = rollup('umd');

    init.pipe(stream)
      .pipe(write);

    write.once('data', (data) => {
      should(data.sourceMap).be.ok;
      data.sourceMap.file.should.be.equal('app.js');
      data.sourceMap.mappings.should.not.be.empty;
      done();
    });

    init.write(fileFactory('app.js'));

    init.end();
  });

  it('should create a bundle with globals from cache', (done) => {
    const stream = rollup({
      external: ['jquery'],
    }, {
      format: 'iife',
      globals: {
        jquery: 'jQuery',
      },
    });

    let resultsCount = 0;
    stream.on('data', (data) => {
      const code = data.contents.toString()
        .replace(/\n/gm, '').replace(/\t/gm, '').trim();
      // eslint-disable-next-line max-len
      code.should.equal('var importsGlobal = (function ($) {\'use strict\';function _interopDefaultLegacy (e) { return e && typeof e === \'object\' && \'default\' in e ? e : { \'default\': e }; }var $__default = /*#__PURE__*/_interopDefaultLegacy($);var importsGlobal = $__default[\'default\'].trim;return importsGlobal;}(jQuery));');
      resultsCount += 1;
    });
    stream.on('end', (data) => {
      resultsCount.should.eql(2);
      done();
    });

    stream.write(fileFactory('importsGlobal'));
    stream.write(fileFactory('importsGlobal'));
    stream.end();
  });
});

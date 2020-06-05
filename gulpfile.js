/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Gulp script to build Blockly for Node & NPM.
 * Run this script by calling "npm install" in this directory.
 */

var gulp = require('gulp');
gulp.shell = require('gulp-shell');
gulp.concat = require('gulp-concat');
gulp.replace = require('gulp-replace');
gulp.rename = require('gulp-rename');
gulp.insert = require('gulp-insert');
gulp.umd = require('gulp-umd');

var path = require('path');
var fs = require('fs');
var rimraf = require('rimraf');
var execSync = require('child_process').execSync;
var through2 = require('through2');

var closureCompiler = require('google-closure-compiler').gulp();
var closureDeps = require('google-closure-deps');
var packageJson = require('./package.json');
var argv = require('yargs').argv;

const upstream_url = "https://github.com/google/blockly.git";

////////////////////////////////////////////////////////////
//                        Build                           //
////////////////////////////////////////////////////////////

const licenseRegex = `\\/\\*\\*
 \\* @license
 \\* (Copyright \\d+ (Google LLC|Massachusetts Institute of Technology))
( \\* All rights reserved.
)? \\*
 \\* Licensed under the Apache License, Version 2.0 \\(the "License"\\);
 \\* you may not use this file except in compliance with the License.
 \\* You may obtain a copy of the License at
 \\*
 \\*   http://www.apache.org/licenses/LICENSE-2.0
 \\*
 \\* Unless required by applicable law or agreed to in writing, software
 \\* distributed under the License is distributed on an "AS IS" BASIS,
 \\* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 \\* See the License for the specific language governing permissions and
 \\* limitations under the License.
 \\*\\/`;

/**
 * Helper method for stripping the Google's and MIT's Apache Licenses.
 */
function stripApacheLicense() {
  // Strip out Google's and MIT's Apache licences.
  // Closure Compiler preserves dozens of Apache licences in the Blockly code.
  // Remove these if they belong to Google or MIT.
  // MIT's permission to do this is logged in Blockly issue #2412.
  return gulp.replace(new RegExp(licenseRegex, "g"), '');
}

/**
 * Helper method for prepending the auto-generated header text.
 */
function prependHeader() {
  return gulp.insert.prepend(`// Do not edit this file; automatically generated by gulp.\n`);
}

/**
 * Closure compiler warning groups used to treat warnings as errors.
 * For a full list of closure compiler groups, consult:
 * https://github.com/google/closure-compiler/blob/master/src/com/google/javascript/jscomp/DiagnosticGroups.java#L113
 */
var JSCOMP_ERROR = [
  'accessControls',
  'checkPrototypalTypes',
  'checkRegExp',
  'checkTypes',
  'checkVars',
  'conformanceViolations',
  'const',
  'constantProperty',
  'deprecated',
  'deprecatedAnnotations',
  'duplicateMessage',
  'es5Strict',
  'externsValidation',
  'functionParams',
  'globalThis',
  'invalidCasts',
  'misplacedTypeAnnotation',
  'missingGetCssName',
  // 'missingOverride',
  'missingPolyfill',
  'missingProperties',
  'missingProvide',
  'missingRequire',
  'missingReturn',
  // 'missingSourcesWarnings',
  'moduleLoad',
  'msgDescriptions',
  'nonStandardJsDocs',
  // 'polymer',
  // 'reportUnknownTypes',
  // 'strictCheckTypes',
  // 'strictMissingProperties',
  'strictModuleDepCheck',
  // 'strictPrimitiveOperators',
  'suspiciousCode',
  'typeInvalidation',
  'undefinedNames',
  'undefinedVars',
  'underscore',
  'unknownDefines',
  'unusedLocalVariables',
  // 'unusedPrivateMembers',
  'useOfGoogBase',
  'uselessCode',
  'untranspilableFeatures',
  'visibility'
];

/**
 * Helper method for calling the Closure compiler.
 * @param {*} compilerOptions
 * @param {boolean=} opt_verbose Optional option for verbose logging
 * @param {boolean=} opt_warnings_as_error Optional option for treating warnings
 *     as errors.
 */
function compile(compilerOptions, opt_verbose, opt_warnings_as_error) {
  compilerOptions = compilerOptions || {};
  compilerOptions.compilation_level = 'SIMPLE_OPTIMIZATIONS';
  compilerOptions.warning_level = opt_verbose ? 'VERBOSE' : 'DEFAULT';
  compilerOptions.language_in =
    compilerOptions.language_in || 'ECMASCRIPT5_STRICT';
  compilerOptions.language_out = 'ECMASCRIPT5_STRICT';
  compilerOptions.rewrite_polyfills = false;
  compilerOptions.hide_warnings_for = 'node_modules';
  if (opt_warnings_as_error) {
    compilerOptions.jscomp_error = JSCOMP_ERROR;
  }

  const platform = ['native', 'java', 'javascript'];

  return closureCompiler(compilerOptions, { platform });
}

/**
 * Helper method for possibly adding the closure library into a sources array.
 * @param {Array.<string>} srcs 
 */
function maybeAddClosureLibrary(srcs) {
  if (argv.closureLibrary) {
    // If you require the google closure library, you can include it in your
    // build by adding the --closure-library flag.
    // You will also need to include the "google-closure-library" in your list
    // of devDependencies.
    console.log('Including the google-closure-library in your build.');
    if (!fs.existsSync('./node_modules/google-closure-library')) {
      throw Error('You must add the google-closure-library to your ' +
        'devDependencies in package.json, and run `npm install`.');
    }
    srcs.push('./node_modules/google-closure-library/closure/goog/**/**/*.js');
  }
  return srcs;
}


/**
 * This task builds the Blockly's built in blocks.
 *     blocks_compressed.js
 */
gulp.task('build-blocks', function () {
  // Add provides used throughout blocks/ in order to be compatible with the
  // compiler.  Anything added to this list must be removed from the compiled
  // result using the remove regex steps below.
  const provides = `
goog.provide('Blockly');
goog.provide('Blockly.Blocks');
goog.provide('Blockly.Comment');
goog.provide('Blockly.FieldCheckbox');
goog.provide('Blockly.FieldColour');
goog.provide('Blockly.FieldDropdown');
goog.provide('Blockly.FieldImage');
goog.provide('Blockly.FieldLabel');
goog.provide('Blockly.FieldMultilineInput');
goog.provide('Blockly.FieldNumber');
goog.provide('Blockly.FieldTextInput');
goog.provide('Blockly.FieldVariable');
goog.provide('Blockly.Mutator');
goog.provide('Blockly.Warning');`;
  return gulp.src(maybeAddClosureLibrary(['blocks/*.js']), {base: './'})
    // Add Blockly.Blocks to be compatible with the compiler.
    .pipe(gulp.replace(`goog.provide('Blockly.Constants.Colour');`,
      `${provides}goog.provide('Blockly.Constants.Colour');`))
    .pipe(stripApacheLicense())
    .pipe(compile({
      dependency_mode: 'NONE',
      externs: ['./externs/goog-externs.js'],
      js_output_file: 'blocks_compressed.js'
    }, argv.verbose, argv.strict))
    .pipe(gulp.replace('\'use strict\';', '\'use strict\';\n\n\n'))
    // Remove Blockly.Blocks to be compatible with Blockly.
    .pipe(gulp.replace(/var Blockly=\{[^;]*\};\n?/, ''))
    // Remove Blockly Fields to be compatible with Blockly.
    .pipe(gulp.replace(/Blockly\.Field[^=\(]+=\{[^;]*\};/g, ''))
    // Remove Blockly Warning, Comment & Mutator to be compatible with Blockly.
    .pipe(gulp.replace(/Blockly\.(Comment|Warning|Mutator)=\{[^;]*\};/g, ''))
    .pipe(prependHeader())
    .pipe(gulp.dest('./BlockPi/src/script/'));
});

/**
 * A helper method for building a Blockly code generator.
 * @param {string} language Generator language.
 * @param {string} namespace Language namespace.
 */
function buildGenerator(language, namespace) {
  var provides = `
goog.provide('Blockly.Generator');
goog.provide('Blockly.utils.global');
goog.provide('Blockly.utils.string');`;
  return gulp.src([`generators/${language}.js`, `generators/${language}/*.js`], {base: './'})
    .pipe(stripApacheLicense())
    // Add Blockly.Generator and Blockly.utils.string to be compatible with the compiler.
    .pipe(gulp.replace(`goog.provide('Blockly.${namespace}');`,
      `${provides}goog.provide('Blockly.${namespace}');`))
    .pipe(compile({
      dependency_mode: 'NONE',
      externs: ['./externs/goog-externs.js'],
      js_output_file: `${language}_compressed.js`
    }, argv.verbose, argv.strict))
    .pipe(gulp.replace('\'use strict\';', '\'use strict\';\n\n\n'))
    // Remove Blockly.Generator and Blockly.utils.string to be compatible with Blockly.
    .pipe(gulp.replace(/var Blockly=\{[^;]*\};\s*Blockly.utils.global={};\s*Blockly.utils.string={};\n?/, ''))
    .pipe(prependHeader())
    .pipe(gulp.dest('./BlockPi/src/script/'));
};


/**
 * This task builds the python generator.
 *     python_compressed.js
 */
gulp.task('build-python', function() {
  return buildGenerator('python', 'Python');
});

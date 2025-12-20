const path = require('path');
const slsw = require('serverless-webpack');

const mode =
  process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
    ? 'production'
    : 'development';
const USE_SOURCE_MAP_DEBUG = true;
const SOURCE_MAP_INIT_PATH = path.resolve(
  __dirname,
  './src/js-helpers/source-map-install.js'
);

const entry = Object.entries(slsw.lib.entries).reduce(
  (entries, [key, value]) => {
    const entry = (entries[key] = [value]);
    if (USE_SOURCE_MAP_DEBUG) {
      entry.unshift(SOURCE_MAP_INIT_PATH);
    }
    return entries;
  },
  {}
);

module.exports = {
  mode,
  entry,
  devtool: 'source-map',
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.ts'],
  },
  output: {
    libraryTarget: 'commonjs',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js',
  },
  target: 'node',
  module: {
    rules: [
      {
        // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
        test: /\.tsx?$/,
        loader: 'ts-loader',
        options: { transpileOnly: true },
      },
    ],
  },
  stats: {
    colors: true,
    hash: false,
    version: false,
    timings: false,
    assets: false,
    chunks: false,
    modules: false,
    warnings: false, // * use this to see the warnings for webpack compiled warnings. Known warnings are with mongodb package currently numbering 9
    reasons: false,
    children: false,
    source: false,
    publicPath: false,
    errorDetails: false, // * use this in conjunction with warnings
  },
  externals: {
    saslprep: 'require("saslprep")',
  },
};

if (mode === 'development') {
  module.exports.externals = [require('webpack-node-externals')()];
}

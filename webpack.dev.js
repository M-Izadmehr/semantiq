// webpack.dev.js - Fresh clean config
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './front/main.js',

  output: {
    filename: 'app.bundle.js',
    path: path.resolve(__dirname, 'outputs', 'dev'),
    clean: true,
    publicPath: '/'
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: './front/index.html',
      filename: 'index.html',
      inject: 'body'
    })
  ],

  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  },

  devServer: {
    static: {
      directory: path.resolve(__dirname, 'front'),
      publicPath: '/'
    },
    port: 3000,
    hot: true,
    compress: true,
    historyApiFallback: true
  },

  devtool: 'source-map',

  optimization: {
    splitChunks: false, // Disable to avoid conflicts
    runtimeChunk: false
  },

  cache: {
    type: 'memory' // Use memory cache only, no filesystem cache
  }
};
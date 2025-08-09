const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'production',
    entry: {
        main: './front/main.js',
        'hint-worker': './front/hint-worker.js'
    },
    output: {
        filename: (pathData) => {
            return pathData.chunk.name === 'hint-worker' ? 'hint-worker.js' : 'main.js';
        },
        path: path.resolve(__dirname, 'outputs', 'dist'),
        clean: true,
        publicPath: './' // Critical for S3 static hosting
    },
    optimization: {
        minimize: true,
        usedExports: true,
        splitChunks: {
            chunks: 'all',
            cacheGroups: {
                default: false,
                vendors: false,
                // Ensure hint-worker stays as separate file
                worker: {
                    name: 'hint-worker',
                    chunks: 'all',
                    test: /hint-worker\.js$/,
                    enforce: true
                }
            }
        }
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './front/index.html',
            filename: 'index.html',
            chunks: ['main'], // Only include main bundle, not worker
            inject: 'body',
            minify: {
                removeComments: true,
                collapseWhitespace: true,
                removeRedundantAttributes: true,
                useShortDoctype: true,
                removeEmptyAttributes: true,
                removeStyleLinkTypeAttributes: true,
                keepClosingSlash: true,
                minifyJS: true,
                minifyCSS: true,
                minifyURLs: true
            }
        }),
        // Copy any additional static files you might have
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'embeddings_quantized.json.br',
                    to: 'embeddings_quantized.json.br',
                    noErrorOnMissing: true
                }
            ]
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
    resolve: {
        extensions: ['.js']
    }
};
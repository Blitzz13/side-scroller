import * as path from "path";
import { merge } from "webpack-merge";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import CopyPlugin from "copy-webpack-plugin";

module.exports = () => {
    const config = {
        entry: "./src/index.ts",

        resolve: {
            extensions: [".ts", ".tsx", ".js", ".json", ".vert", ".frag", ".glsl"],
        },

        module: {
            rules: [
                {
                    test: /\.css$/i,
                    use: [
                        {
                            loader: MiniCssExtractPlugin.loader,
                        },
                        "css-loader",
                    ],
                },
                {
                    test: /\.(vert|frag|glsl)$/i,
                    type: "asset/source",
                },
            ],
        },
        optimization: {
            splitChunks: {
                chunks: "all",
            },
        },

        plugins: [
            new HtmlWebpackPlugin({
                title: "Star Wars Side Scroller",
                meta: {
                    viewport: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
                },
            }),
            new CopyPlugin({
                patterns: [
                    {
                        from: "assets/**",

                        // if there are nested subdirectories , keep the hierarchy
                        to({ absoluteFilename }: { absoluteFilename?: string }) {
                            const assetsPath = path.resolve(__dirname, "assets");

                            if (!absoluteFilename) {
                                throw Error();
                            }

                            const endPath = absoluteFilename.slice(assetsPath.length);

                            return Promise.resolve(`assets/${endPath}`);
                        },
                    },
                ],
            }),
        ],
    };

    const envConfig = require(path.resolve(__dirname, "webpack.dev.ts"))();

    return merge(config, envConfig);;
};

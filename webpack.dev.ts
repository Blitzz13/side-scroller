import * as path from "path";

import MiniCssExtractPlugin from "mini-css-extract-plugin";

module.exports = () => {
    const devConfig = {
        mode: "development",

        devtool: "inline-source-map",

        devServer: {
            open: true,
            client: {
                overlay: {
                    warnings: false,
                    errors: true,
                },
            },
        },

        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: "ts-loader",
                    exclude: /node_modules/,
                },
            ],
        },

        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "[name].js",
        },

        plugins: [
            new MiniCssExtractPlugin({
                filename: "[name].css",
            }),
        ],
    };

    return devConfig;
};

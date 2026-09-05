import * as path from "path";

import MiniCssExtractPlugin from "mini-css-extract-plugin";

module.exports = () => {
    const devConfig = {
        mode: "development",

        devtool: "inline-source-map",

        devServer: {
            host: "0.0.0.0",
            port: 8080,
            allowedHosts: "all",
            open: true,
            client: {
                overlay: {
                    warnings: false,
                    errors: true,
                },
            },
        },

        resolve: {
            extensions: [".ts", ".tsx", ".js", ".json", ".vert", ".frag", ".glsl"],
        },

        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: "ts-loader",
                    exclude: /node_modules/,
                },
                {
                    test: /\.(vert|frag|glsl)$/i,
                    type: "asset/source",
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

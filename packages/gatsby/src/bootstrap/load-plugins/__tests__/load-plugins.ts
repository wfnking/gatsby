jest.mock(`gatsby-cli/lib/reporter`, () => {
  return {
    error: jest.fn(),
    panic: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  }
})
const mockProcessExit = jest.spyOn(process, `exit`).mockImplementation(() => {})
import { loadPlugins } from "../index"
import { slash } from "gatsby-core-utils"
import reporter from "gatsby-cli/lib/reporter"
import { IFlattenedPlugin } from "../types"

describe(`Load plugins`, () => {
  /**
   * Replace the resolve path and version string.
   * Resolve path will vary depending on platform.
   * Version can be updated (we use external plugin in default config).
   * Both will cause snapshots to differ.
   */
  const replaceFieldsThatCanVary = (
    plugins: Array<IFlattenedPlugin>
  ): Array<IFlattenedPlugin> =>
    plugins.map(plugin => {
      if (plugin.pluginOptions && plugin.pluginOptions.path) {
        plugin.pluginOptions = {
          ...plugin.pluginOptions,
          path: plugin.pluginOptions.path.replace(
            slash(process.cwd()),
            `<PROJECT_ROOT>`
          ),
        }
      }

      return {
        ...plugin,
        id: ``,
        resolve: ``,
        version: `1.0.0`,
      }
    })

  it(`Load plugins for a site`, async () => {
    let plugins = await loadPlugins({ plugins: [] })

    plugins = replaceFieldsThatCanVary(plugins)

    expect(plugins).toMatchSnapshot()
  })

  it(`Loads plugins defined with an object but without an options key`, async () => {
    const config = {
      plugins: [
        {
          resolve: `___TEST___`,
        },
      ],
    }

    let plugins = await loadPlugins(config)

    plugins = replaceFieldsThatCanVary(plugins)

    expect(plugins).toMatchSnapshot()
  })

  it(`Throws an error when a plugin is defined with an option key`, async () => {
    expect.assertions(1)
    const config = {
      plugins: [
        {
          resolve: `___TEST___`,
          option: {
            test: true,
          },
        },
      ],
    }

    try {
      await loadPlugins(config)
    } catch (err) {
      expect(err.message).toMatchSnapshot()
    }
  })

  it(`Overrides the options for gatsby-plugin-page-creator`, async () => {
    const config = {
      plugins: [
        {
          resolve: `gatsby-plugin-page-creator`,
          options: {
            path: `${__dirname}/src/pages`,
            ignore: [`___Test___.(js|ts)?(x)`],
          },
        },
      ],
    }

    let plugins = await loadPlugins(config)

    plugins = replaceFieldsThatCanVary(plugins)

    expect(plugins).toMatchSnapshot()
  })

  describe(`TypeScript support`, () => {
    it(`loads gatsby-plugin-typescript if not provided`, async () => {
      const config = {
        plugins: [],
      }

      let plugins = await loadPlugins(config)

      plugins = replaceFieldsThatCanVary(plugins)

      expect(plugins).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            browserAPIs: [],
            id: ``,
            name: `gatsby-plugin-typescript`,
            nodeAPIs: [
              `resolvableExtensions`,
              `onCreateBabelConfig`,
              `onCreateWebpackConfig`,
            ],
            pluginOptions: {
              plugins: [],
            },
            resolve: ``,
            ssrAPIs: [],
            version: `1.0.0`,
          }),
        ])
      )
    })

    it(`uses the user provided plugin-typescript if provided`, async () => {
      const config = {
        plugins: [
          {
            resolve: `gatsby-plugin-typescript`,
            options: {
              jsxPragma: `h`,
            },
          },
        ],
      }

      let plugins = await loadPlugins(config)

      plugins = replaceFieldsThatCanVary(plugins)

      expect(plugins).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            browserAPIs: [],
            id: ``,
            name: `gatsby-plugin-typescript`,
            nodeAPIs: [
              `resolvableExtensions`,
              `onCreateBabelConfig`,
              `onCreateWebpackConfig`,
            ],
            pluginOptions: {
              plugins: [],
              jsxPragma: `h`,
            },
            resolve: ``,
            ssrAPIs: [],
            version: `1.0.0`,
          }),
        ])
      )
    })

    it(`does not add gatsby-plugin-typescript if it exists in config.plugins`, async () => {
      const config = {
        plugins: [
          `gatsby-plugin-typescript`,
          { resolve: `gatsby-plugin-typescript` },
        ],
      }

      let plugins = await loadPlugins(config)

      plugins = replaceFieldsThatCanVary(plugins)

      const tsplugins = plugins.filter(
        (plugin: { name: string }) => plugin.name === `gatsby-plugin-typescript`
      )

      // TODO: I think we should probably be de-duping, so this should be 1.
      // But this test is mostly here to ensure we don't add an _additional_ gatsby-plugin-typescript
      expect(tsplugins.length).toEqual(2)
    })
  })

  describe(`plugin options validation`, () => {
    it(`throws a structured error with invalid plugin options`, async () => {
      const invalidPlugins = [
        {
          resolve: `gatsby-plugin-google-analytics`,
          options: {
            trackingId: 123,
            anonymize: `not a boolean`,
          },
        },
        {
          resolve: `gatsby-plugin-google-analytics`,
          options: {
            anonymize: `still not a boolean`,
          },
        },
      ]
      await loadPlugins({
        plugins: invalidPlugins,
      })

      expect(reporter.error as jest.Mock).toHaveBeenCalledTimes(
        invalidPlugins.length
      )
      expect((reporter.error as jest.Mock).mock.calls[0])
        .toMatchInlineSnapshot(`
        Array [
          Object {
            "context": Object {
              "pluginName": "gatsby-plugin-google-analytics",
              "validationErrors": Array [
                Object {
                  "context": Object {
                    "key": "trackingId",
                    "label": "trackingId",
                    "value": 123,
                  },
                  "message": "\\"trackingId\\" must be a string",
                  "path": Array [
                    "trackingId",
                  ],
                  "type": "string.base",
                },
                Object {
                  "context": Object {
                    "key": "anonymize",
                    "label": "anonymize",
                    "value": "not a boolean",
                  },
                  "message": "\\"anonymize\\" must be a boolean",
                  "path": Array [
                    "anonymize",
                  ],
                  "type": "boolean.base",
                },
              ],
            },
            "id": "11331",
          },
        ]
      `)
      expect((reporter.error as jest.Mock).mock.calls[1])
        .toMatchInlineSnapshot(`
        Array [
          Object {
            "context": Object {
              "pluginName": "gatsby-plugin-google-analytics",
              "validationErrors": Array [
                Object {
                  "context": Object {
                    "key": "anonymize",
                    "label": "anonymize",
                    "value": "still not a boolean",
                  },
                  "message": "\\"anonymize\\" must be a boolean",
                  "path": Array [
                    "anonymize",
                  ],
                  "type": "boolean.base",
                },
              ],
            },
            "id": "11331",
          },
        ]
      `)
      expect(mockProcessExit).toHaveBeenCalledWith(1)
    })
  })
})

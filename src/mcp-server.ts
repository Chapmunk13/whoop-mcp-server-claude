import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { WhoopApiClient } from './whoop-api.js';
import { WhoopApiConfig } from './types.js';

export class WhoopMcpServer {
  private server: Server;
  private whoopClient: WhoopApiClient;

  constructor(config: WhoopApiConfig, sharedClient?: WhoopApiClient) {
    // HTTP mode builds a fresh Server per request but must reuse ONE client, so the token
    // store, proactive refresh and in-flight refresh collapsing are shared rather than
    // duplicated per request.
    this.whoopClient = sharedClient ?? new WhoopApiClient(config);
    
    this.server = new Server(
      {
        name: 'whoop-mcp-server',
        version: '1.0.0',
      },
      {
        // SDK 1.x refuses setRequestHandler for a capability that was not declared.
        // Omitting this compiles fine and then throws at construction:
        // "Server does not support tools (required for tools/list)".
        capabilities: { tools: {} },
      }
    );

    this.setupToolHandlers();
  }

  /** The underlying MCP Server, for transports wired up outside this class. */
  getServer(): Server {
    return this.server;
  }

  /** The shared WHOOP client, so HTTP mode can reuse one token store across requests. */
  getClient(): WhoopApiClient {
    return this.whoopClient;
  }

  private setupToolHandlers() {
    // User tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // User tools
          {
            name: 'whoop-get-user-profile',
            description: 'Get basic user profile information (name, email) for the authenticated user',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'whoop-get-user-body-measurements',
            description: 'Get body measurements (height, weight, max heart rate) for the authenticated user',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'whoop-revoke-user-access',
            description: 'Revoke the access token granted by the user',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          // Cycle tools
          {
            name: 'whoop-get-cycle-by-id',
            description: 'Get the cycle for the specified ID',
            inputSchema: {
              type: 'object',
              properties: {
                cycleId: {
                  type: 'number',
                  description: 'ID of the cycle to retrieve',
                },
              },
              required: ['cycleId'],
            },
          },
          {
            name: 'whoop-get-cycle-collection',
            description: 'Get all physiological cycles for a user, paginated',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Limit on the number of cycles returned (max 25)',
                },
                start: {
                  type: 'string',
                  description: 'Return cycles that occurred after or during this time (ISO 8601)',
                },
                end: {
                  type: 'string',
                  description: 'Return cycles that intersect this time or ended before this time (ISO 8601)',
                },
                nextToken: {
                  type: 'string',
                  description: 'Next token from the previous response to get the next page',
                },
              },
              required: [],
            },
          },
          {
            name: 'whoop-get-sleep-for-cycle',
            description: 'Get sleep data for a specific cycle',
            inputSchema: {
              type: 'object',
              properties: {
                cycleId: {
                  type: 'number',
                  description: 'ID of the cycle to get sleep data for',
                },
              },
              required: ['cycleId'],
            },
          },
          // Recovery tools
          {
            name: 'whoop-get-recovery-collection',
            description: 'Get all recovery data for a user, paginated',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Limit on the number of recovery records returned (max 25)',
                },
                start: {
                  type: 'string',
                  description: 'Return recovery records that occurred after or during this time (ISO 8601)',
                },
                end: {
                  type: 'string',
                  description: 'Return recovery records that intersect this time or ended before this time (ISO 8601)',
                },
                nextToken: {
                  type: 'string',
                  description: 'Next token from the previous response to get the next page',
                },
              },
              required: [],
            },
          },
          {
            name: 'whoop-get-recovery-for-cycle',
            description: 'Get recovery data for a specific cycle',
            inputSchema: {
              type: 'object',
              properties: {
                cycleId: {
                  type: 'number',
                  description: 'ID of the cycle to get recovery data for',
                },
              },
              required: ['cycleId'],
            },
          },
          // Sleep tools
          {
            name: 'whoop-get-sleep-by-id',
            description: 'Get the sleep record for the specified ID',
            inputSchema: {
              type: 'object',
              properties: {
                sleepId: {
                  type: 'string',
                  description: 'ID of the sleep record to retrieve',
                },
              },
              required: ['sleepId'],
            },
          },
          {
            name: 'whoop-get-sleep-collection',
            description: 'Get all sleep records for a user, paginated',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Limit on the number of sleep records returned (max 25)',
                },
                start: {
                  type: 'string',
                  description: 'Return sleep records that occurred after or during this time (ISO 8601)',
                },
                end: {
                  type: 'string',
                  description: 'Return sleep records that intersect this time or ended before this time (ISO 8601)',
                },
                nextToken: {
                  type: 'string',
                  description: 'Next token from the previous response to get the next page',
                },
              },
              required: [],
            },
          },
          // Workout tools
          {
            name: 'whoop-get-workout-by-id',
            description: 'Get the workout record for the specified ID',
            inputSchema: {
              type: 'object',
              properties: {
                workoutId: {
                  type: 'string',
                  description: 'ID of the workout record to retrieve',
                },
              },
              required: ['workoutId'],
            },
          },
          {
            name: 'whoop-get-workout-collection',
            description: 'Get all workout records for a user, paginated',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Limit on the number of workout records returned (max 25)',
                },
                start: {
                  type: 'string',
                  description: 'Return workout records that occurred after or during this time (ISO 8601)',
                },
                end: {
                  type: 'string',
                  description: 'Return workout records that intersect this time or ended before this time (ISO 8601)',
                },
                nextToken: {
                  type: 'string',
                  description: 'Next token from the previous response to get the next page',
                },
              },
              required: [],
            },
          },
          // OAuth tools
          {
            name: 'whoop-get-authorization-url',
            description: 'Get the authorization URL for OAuth flow',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'whoop-exchange-code-for-token',
            description: 'Exchange authorization code for access token',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Authorization code from OAuth callback',
                },
              },
              required: ['code'],
            },
          },
          {
            name: 'whoop-refresh-token',
            description: 'Refresh access token using refresh token',
            inputSchema: {
              type: 'object',
              properties: {
                refreshToken: {
                  type: 'string',
                  description: 'Refresh token to use for getting new access token',
                },
              },
              required: ['refreshToken'],
            },
          },
          {
            name: 'whoop-set-access-token',
            description: 'Set the access token for API calls',
            inputSchema: {
              type: 'object',
              properties: {
                accessToken: {
                  type: 'string',
                  description: 'Access token to use for API calls',
                },
              },
              required: ['accessToken'],
            },
          },
        ] as Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // User tools
          case 'whoop-get-user-profile': {
            const result = await this.whoopClient.getUserProfile();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'whoop-get-user-body-measurements': {
            const result = await this.whoopClient.getUserBodyMeasurements();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'whoop-revoke-user-access': {
            await this.whoopClient.revokeUserAccess();
            return {
              content: [
                {
                  type: 'text',
                  text: 'User access revoked successfully',
                },
              ],
            };
          }

          // Cycle tools
          case 'whoop-get-cycle-by-id': {
            if (!args || typeof args.cycleId !== 'number') {
              throw new Error('cycleId is required and must be a number');
            }
            const result = await this.whoopClient.getCycleById(args.cycleId);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'whoop-get-cycle-collection': {
            const result = await this.whoopClient.getCycleCollection({
              limit: args?.limit as number | undefined,
              start: args?.start as string | undefined,
              end: args?.end as string | undefined,
              nextToken: args?.nextToken as string | undefined,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'whoop-get-sleep-for-cycle': {
            if (!args || typeof args.cycleId !== 'number') {
              throw new Error('cycleId is required and must be a number');
            }
            const result = await this.whoopClient.getSleepForCycle(args.cycleId);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          // Recovery tools
          case 'whoop-get-recovery-collection': {
            const result = await this.whoopClient.getRecoveryCollection({
              limit: args?.limit as number | undefined,
              start: args?.start as string | undefined,
              end: args?.end as string | undefined,
              nextToken: args?.nextToken as string | undefined,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'whoop-get-recovery-for-cycle': {
            if (!args || typeof args.cycleId !== 'number') {
              throw new Error('cycleId is required and must be a number');
            }
            const result = await this.whoopClient.getRecoveryForCycle(args.cycleId);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          // Sleep tools
          case 'whoop-get-sleep-by-id': {
            if (!args || typeof args.sleepId !== 'string') {
              throw new Error('sleepId is required and must be a string');
            }
            const result = await this.whoopClient.getSleepById(args.sleepId);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'whoop-get-sleep-collection': {
            const result = await this.whoopClient.getSleepCollection({
              limit: args?.limit as number | undefined,
              start: args?.start as string | undefined,
              end: args?.end as string | undefined,
              nextToken: args?.nextToken as string | undefined,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          // Workout tools
          case 'whoop-get-workout-by-id': {
            if (!args || typeof args.workoutId !== 'string') {
              throw new Error('workoutId is required and must be a string');
            }
            const result = await this.whoopClient.getWorkoutById(args.workoutId);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'whoop-get-workout-collection': {
            const result = await this.whoopClient.getWorkoutCollection({
              limit: args?.limit as number | undefined,
              start: args?.start as string | undefined,
              end: args?.end as string | undefined,
              nextToken: args?.nextToken as string | undefined,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          // OAuth tools
          case 'whoop-get-authorization-url': {
            const url = this.whoopClient.getAuthorizationUrl();
            return {
              content: [
                {
                  type: 'text',
                  text: `Authorization URL: ${url}`,
                },
              ],
            };
          }

          case 'whoop-exchange-code-for-token': {
            if (!args || typeof args.code !== 'string') {
              throw new Error('code is required and must be a string');
            }
            const result = await this.whoopClient.exchangeCodeForToken(args.code);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'whoop-refresh-token': {
            if (!args || typeof args.refreshToken !== 'string') {
              throw new Error('refreshToken is required and must be a string');
            }
            const result = await this.whoopClient.refreshToken(args.refreshToken);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'whoop-set-access-token': {
            if (!args || typeof args.accessToken !== 'string') {
              throw new Error('accessToken is required and must be a string');
            }
            this.whoopClient.setAccessToken(args.accessToken);
            return {
              content: [
                {
                  type: 'text',
                  text: 'Access token set successfully',
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async runStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('WHOOP MCP Server started (stdio)');
  }

  /** Back-compat alias. Existing callers and the stdio entry point use this. */
  async run() {
    return this.runStdio();
  }
}

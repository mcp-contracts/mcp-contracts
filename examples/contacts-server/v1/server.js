/**
 * Contacts MCP Server — v1.0.0
 *
 * A minimal MCP server that exposes contact management tools.
 * Used as a demo for mcpdiff. This is the "before" version.
 *
 * Tools:
 *   - create_contact: Create a new contact
 *   - get_contact: Get a contact by ID
 *   - search_contacts: Search contacts by query
 *   - delete_contact: Delete a contact
 *   - update_contact: Update a contact
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "contacts-server",
  version: "1.0.0",
});

// --- Tools ---

server.tool(
  "create_contact",
  "Create a new contact in the address book",
  {
    name: z.string().describe("Full name of the contact"),
    email: z.string().email().describe("Email address"),
    company: z.string().optional().describe("Company or organization name"),
  },
  async ({ name, email, company }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { id: "c_001", name, email, company: company ?? null, created: true },
          null,
          2,
        ),
      },
    ],
  }),
);

server.tool(
  "get_contact",
  "Retrieve a contact by their unique ID",
  {
    id: z.string().describe("The contact's unique identifier (e.g., c_001)"),
  },
  async ({ id }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { id, name: "Jane Doe", email: "jane@example.com", company: "Acme Inc" },
          null,
          2,
        ),
      },
    ],
  }),
);

server.tool(
  "search_contacts",
  "Search for contacts by name, email, or company",
  {
    query: z.string().describe("Search query to match against contact fields"),
    limit: z.number().int().min(1).max(100).default(10).describe("Maximum number of results"),
  },
  async ({ query, limit }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            query,
            limit,
            results: [{ id: "c_001", name: "Jane Doe", email: "jane@example.com" }],
            total: 1,
          },
          null,
          2,
        ),
      },
    ],
  }),
);

server.tool(
  "delete_contact",
  "Permanently delete a contact by ID",
  {
    id: z.string().describe("The contact's unique identifier"),
    confirm: z.boolean().describe("Must be true to confirm deletion"),
  },
  async ({ id, confirm }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({ id, deleted: confirm, timestamp: new Date().toISOString() }, null, 2),
      },
    ],
  }),
);

server.tool(
  "update_contact",
  "Update fields on an existing contact",
  {
    id: z.string().describe("The contact's unique identifier"),
    name: z.string().optional().describe("Updated full name"),
    email: z.union([z.string().email(), z.string().url()]).optional().describe("Updated email or profile URL"),
    company: z.string().optional().describe("Updated company name"),
  },
  async ({ id, ...updates }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({ id, updated: Object.keys(updates), timestamp: new Date().toISOString() }, null, 2),
      },
    ],
  }),
);

// --- Resources ---

server.resource("contacts://stats", "contacts://stats", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify({ totalContacts: 42, lastUpdated: "2026-02-20T12:00:00Z" }),
    },
  ],
}));

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);

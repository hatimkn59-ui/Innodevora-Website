\# Graphify-First Development Rules



\## Mandatory Graphify Workflow



Before performing ANY task in this repository:



1\. Read the existing Graphify knowledge graph first:

&#x20;  - `graphify-out/graph.json`

&#x20;  - `graphify-out/GRAPH\_REPORT.md` if it exists.

2\. Run `graphify query` to understand the relevant architecture, files, dependencies, and relationships.

3\. Use the graph to identify the correct files and understand their connections before editing.

4\. Never rebuild the graph unnecessarily.

5\. If the graph is missing or outdated, run:

&#x20;  `graphify extract . --code-only`

6\. After modifying code, update the graph when structural changes make it necessary.



\## Important



\- Graphify is the first step before planning or coding.

\- Do not blindly scan the entire project if an existing graph is available.

\- Do not modify files before consulting Graphify.

\- Use the actual project structure and graph data, never assume file relationships.

\- If Graphify fails, explain the error instead of silently ignoring it.


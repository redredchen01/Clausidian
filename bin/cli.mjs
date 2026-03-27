#!/usr/bin/env node

/**
 * obsidian-agent CLI — AI agent toolkit for Obsidian vaults
 *
 * Usage:
 *   obsidian-agent init <path>              Initialize a new vault
 *   obsidian-agent journal [--date DATE]    Create/open today's journal
 *   obsidian-agent note <title> <type>      Create a note (area/project/resource/idea)
 *   obsidian-agent capture <idea>           Quick idea capture
 *   obsidian-agent search <keyword>         Search notes
 *   obsidian-agent list [type]              List notes
 *   obsidian-agent review                   Generate weekly review
 *   obsidian-agent sync                     Rebuild indices
 *   obsidian-agent hook <event>             Handle agent hook events
 */

const args = process.argv.slice(2);
const command = args[0];

// Parse flags
function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    } else {
      positional.push(args[i]);
    }
  }
  return { flags, positional };
}

// Resolve vault root: --vault flag, OA_VAULT env, or cwd
function resolveVault(flags) {
  return flags.vault || process.env.OA_VAULT || process.cwd();
}

async function main() {
  const { flags, positional } = parseFlags(args.slice(1));
  const jsonMode = flags.json === true;

  // In JSON mode, suppress console.log and capture return values
  const origLog = console.log;
  if (jsonMode) console.log = () => {};

  let result;

  switch (command) {
    case 'init': {
      const { init } = await import('../src/commands/init.mjs');
      result = init(positional[0] || '.');
      break;
    }

    case 'journal': {
      const { journal } = await import('../src/commands/journal.mjs');
      result = journal(resolveVault(flags), { date: flags.date });
      break;
    }

    case 'note': {
      const { note } = await import('../src/commands/note.mjs');
      const title = positional[0];
      const type = positional[1];
      if (!title || !type) {
        console.error('Usage: obsidian-agent note <title> <type>');
        console.error('Types: area, project, resource, idea');
        process.exit(1);
      }
      const tags = flags.tags ? flags.tags.split(',') : [];
      result = note(resolveVault(flags), title, type, { tags, goal: flags.goal, summary: flags.summary });
      break;
    }

    case 'capture': {
      const { capture } = await import('../src/commands/capture.mjs');
      const idea = positional.join(' ');
      if (!idea) {
        console.error('Usage: obsidian-agent capture <idea text>');
        process.exit(1);
      }
      result = capture(resolveVault(flags), idea);
      break;
    }

    case 'search': {
      const { search } = await import('../src/commands/search.mjs');
      result = search(resolveVault(flags), positional[0], {
        type: flags.type,
        tag: flags.tag,
        status: flags.status,
      });
      break;
    }

    case 'list': {
      const { list } = await import('../src/commands/list.mjs');
      result = list(resolveVault(flags), {
        type: positional[0],
        tag: flags.tag,
        status: flags.status,
        recent: flags.recent ? parseInt(flags.recent) : undefined,
      });
      break;
    }

    case 'review': {
      if (positional[0] === 'monthly') {
        const { monthlyReview } = await import('../src/commands/review.mjs');
        result = monthlyReview(resolveVault(flags), {
          year: flags.year ? parseInt(flags.year) : undefined,
          month: flags.month ? parseInt(flags.month) : undefined,
        });
      } else {
        const { review } = await import('../src/commands/review.mjs');
        result = review(resolveVault(flags), { date: flags.date });
      }
      break;
    }

    case 'sync': {
      const { sync } = await import('../src/commands/sync.mjs');
      result = sync(resolveVault(flags));
      break;
    }

    case 'read': {
      const { read } = await import('../src/commands/read.mjs');
      result = read(resolveVault(flags), positional[0], { section: flags.section });
      break;
    }

    case 'delete': {
      const { deleteNote } = await import('../src/commands/delete.mjs');
      result = deleteNote(resolveVault(flags), positional[0]);
      break;
    }

    case 'recent': {
      const { recent } = await import('../src/commands/recent.mjs');
      result = recent(resolveVault(flags), {
        days: positional[0] ? parseInt(positional[0]) : flags.recent ? parseInt(flags.recent) : 7,
      });
      break;
    }

    case 'backlinks': {
      const { backlinks } = await import('../src/commands/backlinks.mjs');
      result = backlinks(resolveVault(flags), positional[0]);
      break;
    }

    case 'update': {
      const { update } = await import('../src/commands/update.mjs');
      result = update(resolveVault(flags), positional[0], {
        status: flags.status,
        tags: flags.tags,
        tag: flags.tag,
        summary: flags.summary,
      });
      break;
    }

    case 'archive': {
      const { archive } = await import('../src/commands/archive.mjs');
      result = archive(resolveVault(flags), positional[0]);
      break;
    }

    case 'stats': {
      const { stats } = await import('../src/commands/stats.mjs');
      result = stats(resolveVault(flags));
      break;
    }

    case 'graph': {
      const { graph } = await import('../src/commands/graph.mjs');
      result = graph(resolveVault(flags), { type: flags.type });
      break;
    }

    case 'orphans': {
      const { orphans } = await import('../src/commands/orphans.mjs');
      result = orphans(resolveVault(flags));
      break;
    }

    case 'patch': {
      const { patch } = await import('../src/commands/patch.mjs');
      result = patch(resolveVault(flags), positional[0], {
        heading: flags.heading,
        append: flags.append,
        prepend: flags.prepend,
        replace: flags.replace,
      });
      break;
    }

    case 'tag': {
      const subcmd = positional[0];
      if (subcmd === 'rename') {
        const { tagRename } = await import('../src/commands/tag.mjs');
        result = tagRename(resolveVault(flags), positional[1], positional[2]);
      } else if (subcmd === 'list') {
        const { tagList } = await import('../src/commands/tag.mjs');
        result = tagList(resolveVault(flags));
      } else {
        console.error('Usage: obsidian-agent tag <rename|list>');
        process.exit(1);
      }
      break;
    }

    case 'watch': {
      const { watch } = await import('../src/commands/watch.mjs');
      result = watch(resolveVault(flags));
      return; // Keeps running
    }

    case 'health': {
      const { health } = await import('../src/commands/health.mjs');
      result = health(resolveVault(flags));
      break;
    }

    case 'serve': {
      const { McpServer } = await import('../src/mcp-server.mjs');
      const server = new McpServer(resolveVault(flags));
      server.start();
      return; // Don't exit — server runs indefinitely
    }

    case 'hook': {
      const event = positional[0];
      const vaultRoot = resolveVault(flags);
      if (event === 'session-stop') {
        const { sessionStop } = await import('../src/commands/hook.mjs');
        sessionStop(vaultRoot, { scanRoot: flags['scan-root'] });
      } else if (event === 'daily-backfill') {
        const { dailyBackfill } = await import('../src/commands/hook.mjs');
        dailyBackfill(vaultRoot, {
          date: flags.date,
          scanRoot: flags['scan-root'],
          force: flags.force === true,
        });
      } else {
        console.error(`Unknown hook event: ${event}`);
        console.error('Available: session-stop, daily-backfill');
        process.exit(1);
      }
      break;
    }

    case 'version':
    case '--version':
    case '-v': {
      const { readFileSync } = await import('fs');
      const { resolve, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      console.log(`obsidian-agent v${pkg.version}`);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    case undefined: {
      console.log(`
obsidian-agent — AI agent toolkit for Obsidian vaults

Commands:
  init <path>              Initialize a new agent-friendly vault
  journal [--date DATE]    Create/open today's journal
  note <title> <type>      Create a note (area/project/resource/idea)
  capture <idea>           Quick idea capture
  read <note>              Read a note's content
  recent [days]            Show recently updated notes (default: 7 days)
  delete <note>            Delete a note and clean up references
  search <keyword>         Full-text search across all notes
  list [type]              List notes with filters
  review                   Generate weekly review
  review monthly           Generate monthly review
  sync                     Rebuild tag & graph indices
  backlinks <note>         Show notes that link to a note
  update <note>            Update note frontmatter fields
  archive <note>           Set note status to archived
  stats                    Show vault statistics
  graph                    Generate Mermaid knowledge graph
  orphans                  Find notes with no inbound links
  patch <note>             Edit a section by heading
  tag list                 List all tags with counts
  tag rename <old> <new>   Rename a tag across the vault
  watch                    Auto-rebuild indices on file changes
  health                   Vault health scoring report
  serve                    Start MCP server (stdio transport)
  hook <event>             Handle agent hook events

Flags:
  --vault <path>           Vault root (default: cwd or $OA_VAULT)
  --type <type>            Filter by note type
  --tag <tag>              Filter by tag
  --status <status>        Filter by status
  --recent <days>          Show notes updated in last N days
  --date <YYYY-MM-DD>      Specify date for journal/review
  --year <YYYY>            Year for monthly review
  --month <MM>             Month for monthly review (1-12)
  --summary <text>         Set note summary
  --tags <a,b,c>           Set tags
  --json                   Output as JSON (machine-readable)
  --heading <name>         Target heading (for patch)
  --append <text>          Append to section (for patch)
  --prepend <text>         Prepend to section (for patch)

Hook events:
  session-stop             Append session summary to journal
  daily-backfill           Create journal from git history

Environment:
  OA_VAULT                 Default vault path
  OA_TIMEZONE              Timezone for dates (default: UTC)

Examples:
  obsidian-agent init ~/my-vault
  obsidian-agent journal
  obsidian-agent note "Learn Rust" project --tags "coding,learning"
  obsidian-agent capture "Use Rust to rewrite the bottleneck module"
  obsidian-agent search "API" --type resource
  obsidian-agent list project --status active
  obsidian-agent review
  obsidian-agent sync
`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "obsidian-agent help" for usage.');
      process.exit(1);
  }

  // JSON output mode
  if (jsonMode && result !== undefined) {
    console.log = origLog;
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

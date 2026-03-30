#!/usr/bin/env node

/**
 * obsidian-agent CLI — AI agent toolkit for Obsidian vaults
 */

const args = process.argv.slice(2);
const command = args[0];

function levenshtein(a, b) {
  if (!a || !b) return Math.max((a || '').length, (b || '').length);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + (a[i-1] !== b[j-1] ? 1 : 0));
  return dp[m][n];
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const eqIdx = args[i].indexOf('=');
      if (eqIdx !== -1) {
        flags[args[i].slice(2, eqIdx)] = args[i].slice(eqIdx + 1);
      } else {
        const key = args[i].slice(2);
        flags[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      }
    } else {
      positional.push(args[i]);
    }
  }
  return { flags, positional };
}

function resolveVault(flags) {
  return flags.vault || process.env.OA_VAULT || process.cwd();
}

async function main() {
  const { flags, positional } = parseFlags(args.slice(1));
  const jsonMode = flags.json === true;
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
        process.exit(1);
      }
      const tags = flags.tags ? flags.tags.split(',') : [];
      result = note(resolveVault(flags), title, type, { tags, goal: flags.goal, summary: flags.summary });
      break;
    }

    case 'capture': {
      const { capture } = await import('../src/commands/capture.mjs');
      const idea = positional.join(' ');
      if (!idea) { console.error('Usage: obsidian-agent capture <idea text>'); process.exit(1); }
      result = capture(resolveVault(flags), idea);
      break;
    }

    case 'search': {
      const { search } = await import('../src/commands/search.mjs');
      result = search(resolveVault(flags), positional[0], {
        type: flags.type, tag: flags.tag, status: flags.status,
        regex: flags.regex === true,
      });
      break;
    }

    case 'list': {
      const { list } = await import('../src/commands/list.mjs');
      result = list(resolveVault(flags), {
        type: positional[0], tag: flags.tag, status: flags.status,
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
        status: flags.status, tags: flags.tags, tag: flags.tag, summary: flags.summary,
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
        heading: flags.heading, append: flags.append, prepend: flags.prepend, replace: flags.replace,
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

    // ── v0.7 new commands ────────────────────────────

    case 'rename': {
      const { rename } = await import('../src/commands/rename.mjs');
      if (!positional[0] || !positional[1]) {
        console.error('Usage: obsidian-agent rename <note-name> <new-title>');
        process.exit(1);
      }
      result = rename(resolveVault(flags), positional[0], positional[1]);
      break;
    }

    case 'move': {
      const { move } = await import('../src/commands/move.mjs');
      if (!positional[0] || !positional[1]) {
        console.error('Usage: obsidian-agent move <note-name> <new-type>');
        process.exit(1);
      }
      result = move(resolveVault(flags), positional[0], positional[1]);
      break;
    }

    case 'merge': {
      const { merge } = await import('../src/commands/merge.mjs');
      if (!positional[0] || !positional[1]) {
        console.error('Usage: obsidian-agent merge <source-note> <target-note>');
        process.exit(1);
      }
      result = merge(resolveVault(flags), positional[0], positional[1]);
      break;
    }

    case 'duplicates': {
      const { duplicates } = await import('../src/commands/duplicates.mjs');
      result = duplicates(resolveVault(flags), {
        threshold: flags.threshold ? parseFloat(flags.threshold) : undefined,
      });
      break;
    }

    case 'broken-links': {
      const { brokenLinks } = await import('../src/commands/broken-links.mjs');
      result = brokenLinks(resolveVault(flags));
      break;
    }

    case 'batch': {
      const subcmd = positional[0];
      if (subcmd === 'update') {
        const { batchUpdate } = await import('../src/commands/batch.mjs');
        result = batchUpdate(resolveVault(flags), {
          type: flags.type, tag: flags.tag, status: flags.status,
          setStatus: flags['set-status'], setSummary: flags['set-summary'],
        });
      } else if (subcmd === 'tag') {
        const { batchTag } = await import('../src/commands/batch.mjs');
        result = batchTag(resolveVault(flags), {
          type: flags.type, tag: flags.tag, status: flags.status,
          add: flags.add, remove: flags.remove,
        });
      } else if (subcmd === 'archive') {
        const { batchArchive } = await import('../src/commands/batch.mjs');
        result = batchArchive(resolveVault(flags), {
          type: flags.type, tag: flags.tag, status: flags.status,
        });
      } else {
        console.error('Usage: obsidian-agent batch <update|tag|archive> [--type TYPE] [--tag TAG]');
        process.exit(1);
      }
      break;
    }

    case 'export': {
      const { exportNotes } = await import('../src/commands/export.mjs');
      result = exportNotes(resolveVault(flags), {
        type: flags.type, tag: flags.tag, status: flags.status,
        format: flags.format, output: positional[0],
      });
      break;
    }

    case 'import': {
      const { importNotes } = await import('../src/commands/import.mjs');
      result = importNotes(resolveVault(flags), positional[0]);
      break;
    }

    case 'link': {
      const { link } = await import('../src/commands/link.mjs');
      result = link(resolveVault(flags), {
        dryRun: flags['dry-run'] === true,
        threshold: flags.threshold ? parseFloat(flags.threshold) : undefined,
      });
      break;
    }

    case 'timeline': {
      const { timeline } = await import('../src/commands/timeline.mjs');
      result = timeline(resolveVault(flags), {
        days: flags.days ? parseInt(flags.days) : undefined,
        type: flags.type,
        limit: flags.limit ? parseInt(flags.limit) : undefined,
      });
      break;
    }

    case 'validate': {
      const { validate } = await import('../src/commands/validate.mjs');
      result = validate(resolveVault(flags));
      break;
    }

    case 'pin': {
      if (positional[0] === 'list') {
        const { listPinned } = await import('../src/commands/pin.mjs');
        result = listPinned(resolveVault(flags));
      } else {
        const { pin } = await import('../src/commands/pin.mjs');
        result = pin(resolveVault(flags), positional[0]);
      }
      break;
    }

    case 'unpin': {
      const { unpin } = await import('../src/commands/pin.mjs');
      result = unpin(resolveVault(flags), positional[0]);
      break;
    }

    case 'relink': {
      const { relink } = await import('../src/commands/relink.mjs');
      result = relink(resolveVault(flags), { dryRun: flags['dry-run'] === true });
      break;
    }

    case 'suggest': {
      const { suggest } = await import('../src/commands/suggest.mjs');
      result = suggest(resolveVault(flags), {
        limit: flags.limit ? parseInt(flags.limit) : undefined,
      });
      break;
    }

    case 'daily': {
      const { daily } = await import('../src/commands/daily.mjs');
      result = daily(resolveVault(flags));
      break;
    }

    // ── existing utility commands ────────────────────

    case 'setup': {
      const { setup } = await import('../src/commands/setup.mjs');
      result = setup(positional[0]);
      break;
    }

    case 'watch': {
      const { watch } = await import('../src/commands/watch.mjs');
      result = watch(resolveVault(flags));
      return;
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
      return;
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
          date: flags.date, scanRoot: flags['scan-root'], force: flags.force === true,
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
  search <keyword>         Full-text search (supports --regex)
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

  rename <note> <title>    Rename a note and update all references
  move <note> <type>       Move note to a different type/directory
  merge <source> <target>  Merge source note into target
  duplicates               Find potentially duplicate notes
  broken-links             Find broken [[wikilinks]]

  batch update [filters]   Batch update notes (--set-status, --set-summary)
  batch tag [filters]      Batch add/remove tags (--add, --remove)
  batch archive [filters]  Batch archive matching notes

  export [output]          Export notes (--format json|markdown)
  import <file>            Import notes from JSON or markdown

  link                     Auto-link related but unlinked notes
  timeline                 Chronological activity feed
  validate                 Check frontmatter completeness
  pin <note>               Pin a note as favorite
  unpin <note>             Unpin a note
  pin list                 Show all pinned notes
  relink                   Fix broken links with closest matches
  suggest                  Actionable vault improvement suggestions
  daily                    Daily dashboard (journal, activity, pinned)

  setup [vault-path]       Install MCP server + skill
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
  --regex                  Treat search keyword as regex
  --threshold <0-1>        Duplicate similarity threshold (default: 0.5)
  --format <json|md>       Export format (default: json)
  --set-status <status>    For batch update
  --add <tag>              For batch tag (add tag)
  --remove <tag>           For batch tag (remove tag)
  --json                   Output as JSON (machine-readable)
`);
      break;
    }

    default: {
      const cmds = [
        'init','journal','note','capture','search','list','review','sync','read','delete',
        'recent','backlinks','update','archive','stats','graph','orphans','patch','tag',
        'watch','health','setup','serve','hook','version','help',
        'rename','move','merge','duplicates','broken-links','batch','export','import',
        'link','timeline','validate','pin','unpin','relink','suggest','daily',
      ];
      const similar = cmds.filter(c => c.startsWith(command?.slice(0, 2) || '') || levenshtein(c, command) <= 2);
      console.error(`Unknown command: ${command}`);
      if (similar.length) console.error(`Did you mean: ${similar.join(', ')}?`);
      else console.error('Run "obsidian-agent help" for usage.');
      process.exit(1);
    }
  }

  if (jsonMode && result !== undefined) {
    console.log = origLog;
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

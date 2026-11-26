'use strict';
// GitHub Developer Hub Backend: Contribution Calendar & Streaks, Open PRs/Issues,
// Recent Stargazers, Following Activity Feed, and GitHub Actions CI/CD Status.
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const GITHUB_API = 'https://api.github.com';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

function execFileText(bin, args, timeout = 3500) {
  return new Promise(resolve => {
    execFile(bin, args, { windowsHide: true, timeout, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout || '').trim());
    });
  });
}

function isoDateOffset(baseIso, deltaDays) {
  const [y, m, d] = String(baseIso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays));
  return dt.toISOString().slice(0, 10);
}

/**
 * Computes total contributions, today count, active current streak, and longest streak
 * from a chronological list of { date: 'YYYY-MM-DD', count: number }.
 */
function computeContributionStreaks(days, todayIso = '') {
  const list = (Array.isArray(days) ? days : [])
    .filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(String(d.date)))
    .map(d => ({ date: String(d.date), count: Math.max(0, Number(d.count) || 0) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!list.length) {
    return { totalYear: 0, todayCount: 0, currentStreak: 0, longestStreak: 0, longestRange: null };
  }

  const byDate = new Map(list.map(d => [d.date, d.count]));
  const totalYear = list.reduce((s, d) => s + d.count, 0);
  const refToday = /^\d{4}-\d{2}-\d{2}$/.test(todayIso) ? todayIso : list[list.length - 1].date;
  const todayCount = byDate.get(refToday) || 0;

  let longestStreak = 0;
  let longestRange = null;
  let run = 0;
  let runStart = '';
  let prevDate = '';

  for (const d of list) {
    if (d.count > 0) {
      if (run > 0 && prevDate && isoDateOffset(prevDate, 1) === d.date) {
        run++;
      } else {
        run = 1;
        runStart = d.date;
      }
      if (run >= longestStreak) {
        longestStreak = run;
        longestRange = { start: runStart, end: d.date };
      }
    } else {
      run = 0;
      runStart = '';
    }
    prevDate = d.date;
  }

  // Current streak: count backwards from today (or yesterday if today still has 0 commits)
  let cursor = todayCount > 0 ? refToday : isoDateOffset(refToday, -1);
  let currentStreak = 0;
  while ((byDate.get(cursor) || 0) > 0) {
    currentStreak++;
    cursor = isoDateOffset(cursor, -1);
  }

  return { totalYear, todayCount, currentStreak, longestStreak, longestRange };
}

/**
 * Normalizes a GitHub received_events entry into a compact, emoji-free summary object.
 */
function summarizeEvent(ev) {
  if (!ev || !ev.actor?.login || !ev.repo?.name) return null;
  const actor = String(ev.actor.login);
  const repo = String(ev.repo.name);
  const type = String(ev.type || '');
  const p = ev.payload || {};
  let action = 'activity';
  let detail = '';
  let url = `https://github.com/${repo}`;

  if (type === 'PushEvent') {
    const cnt = Number(p.size) || (Array.isArray(p.commits) ? p.commits.length : 1) || 1;
    const branch = String(p.ref || '').replace(/^refs\/heads\//, '');
    action = 'push';
    detail = `${cnt} commit${branch ? ` · ${branch}` : ''}`;
  } else if (type === 'WatchEvent') {
    action = 'star';
    detail = 'starred';
  } else if (type === 'PullRequestEvent') {
    action = 'pr';
    const num = p.pull_request?.number ? `#${p.pull_request.number}` : '';
    detail = `${p.action || 'updated'} ${num} ${(p.pull_request?.title || '').slice(0, 44)}`.trim();
    if (p.pull_request?.html_url) url = p.pull_request.html_url;
  } else if (type === 'IssuesEvent') {
    action = 'issue';
    const num = p.issue?.number ? `#${p.issue.number}` : '';
    detail = `${p.action || 'updated'} ${num} ${(p.issue?.title || '').slice(0, 44)}`.trim();
    if (p.issue?.html_url) url = p.issue.html_url;
  } else if (type === 'CreateEvent') {
    action = 'create';
    detail = `${p.ref_type || 'repo'}${p.ref ? ` · ${p.ref}` : ''}`;
  } else if (type === 'ReleaseEvent') {
    action = 'release';
    detail = String(p.release?.tag_name || p.release?.name || 'release');
    if (p.release?.html_url) url = p.release.html_url;
  } else if (type === 'ForkEvent') {
    action = 'fork';
    detail = p.forkee?.full_name ? `-> ${p.forkee.full_name}` : 'forked';
  } else {
    detail = type.replace(/Event$/, '');
  }

  return {
    id: String(ev.id || `${actor}-${repo}-${ev.created_at}`),
    actor,
    action,
    repo,
    detail,
    url,
    at: ev.created_at || ''
  };
}

function setupGitHub(electron, deps) {
  const { safeStorage, net, BrowserWindow } = electron;
  const { handleBoth, send, readJson, writeJson, resolvedRepoDir } = deps;

  const encrypt = val => {
    if (!val) return '';
    try {
      if (safeStorage?.isEncryptionAvailable?.()) {
        return 'dpapi:' + safeStorage.encryptString(String(val)).toString('base64');
      }
    } catch {}
    return 'b64:' + Buffer.from(String(val), 'utf8').toString('base64');
  };
  const decrypt = raw => {
    const s = String(raw || '');
    if (!s) return '';
    try {
      if (s.startsWith('dpapi:') && safeStorage?.isEncryptionAvailable?.()) {
        return safeStorage.decryptString(Buffer.from(s.slice(6), 'base64'));
      }
      if (s.startsWith('b64:')) return Buffer.from(s.slice(4), 'base64').toString('utf8');
    } catch {}
    return '';
  };

  let cfg = readJson('github-config.json', { username: '', tokenEnc: '' }) || { username: '', tokenEnc: '' };
  let cache = readJson('github-cache.json', null);
  let ghCliToken = null;
  let ghCliLogin = '';
  let pendingFetch = null;
  let lastRunStates = new Map();

  async function resolveAuth() {
    const manualToken = decrypt(cfg.tokenEnc);
    if (manualToken) {
      return { token: manualToken, username: cfg.username || '', source: 'token' };
    }
    if (ghCliToken === null) {
      ghCliToken = await execFileText('gh', ['auth', 'token'], 2500);
      if (ghCliToken && !cfg.username) {
        const out = await execFileText('gh', ['api', 'user', '--jq', '.login'], 3000);
        if (out && /^[\w-]+$/.test(out)) ghCliLogin = out;
      }
    }
    if (ghCliToken) {
      return { token: ghCliToken, username: cfg.username || ghCliLogin || '', source: 'gh' };
    }
    let username = cfg.username || '';
    if (!username && typeof resolvedRepoDir === 'function') {
      const dir = resolvedRepoDir();
      if (dir) {
        const remote = await execFileText('git', ['-C', dir, 'remote', 'get-url', 'origin'], 2000);
        const m = /github\.com[:/]([^/]+)\//i.exec(remote);
        if (m) username = m[1];
      }
    }
    return { token: '', username, source: username ? 'public' : 'none' };
  }

  async function ghJson(url, opts = {}) {
    const doFetch = net?.fetch || globalThis.fetch;
    const res = await doFetch(url, {
      ...opts,
      signal: AbortSignal.timeout(opts.timeout || 7000),
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'LumaDock',
        ...(opts.headers || {})
      }
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  }

  async function fetchSummary(force = false) {
    if (!force && cache && Date.now() - cache.at < 3 * 60000) {
      return cache.data;
    }
    if (pendingFetch) return pendingFetch;

    pendingFetch = (async () => {
      try {
        const auth = await resolveAuth();
        if (!auth.token && !auth.username) {
          return {
            connected: false,
            authSource: 'none',
            profile: null,
            contributions: { totalYear: 0, todayCount: 0, currentStreak: 0, longestStreak: 0, weeks: [] },
            prs: [],
            issues: [],
            stargazers: [],
            following: [],
            actions: []
          };
        }

        const headers = auth.token ? { Authorization: `Bearer ${auth.token}` } : {};
        let profile = null;
        let login = auth.username;
        let weeks = [];
        let days = [];
        let totalFromGql = 0;
        let prs = [];
        let issues = [];
        let reposForMeta = [];

        if (auth.token) {
          const gqlQuery = `query {
            viewer {
              login name avatarUrl
              followers { totalCount }
              repositories(first: 10, orderBy: { field: PUSHED_AT, direction: DESC }, ownerAffiliations: OWNER) {
                nodes { nameWithOwner stargazerCount url isPrivate }
              }
              contributionsCollection {
                contributionCalendar {
                  totalContributions
                  weeks {
                    contributionDays { date contributionCount color contributionLevel }
                  }
                }
              }
            }
          }`;
          const gql = await ghJson(GITHUB_GRAPHQL, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: gqlQuery })
          });
          const viewer = gql?.data?.viewer;
          if (viewer?.login) {
            login = viewer.login;
            profile = {
              login: viewer.login,
              name: viewer.name || viewer.login,
              avatarUrl: viewer.avatarUrl || '',
              followers: viewer.followers?.totalCount || 0
            };
            const cal = viewer.contributionsCollection?.contributionCalendar;
            totalFromGql = cal?.totalContributions || 0;
            weeks = Array.isArray(cal?.weeks) ? cal.weeks.map(w => (w.contributionDays || []).map(d => ({
              date: d.date,
              count: d.contributionCount,
              level: d.contributionLevel === 'NONE' ? 0 : d.contributionLevel === 'FIRST_QUARTILE' ? 1 : d.contributionLevel === 'SECOND_QUARTILE' ? 2 : d.contributionLevel === 'THIRD_QUARTILE' ? 3 : 4
            }))) : [];
            days = weeks.flat();
            reposForMeta = viewer.repositories?.nodes || [];
          }
        }

        if (!profile && login) {
          const u = await ghJson(`${GITHUB_API}/users/${encodeURIComponent(login)}`, { headers });
          if (u?.login) {
            login = u.login;
            profile = { login: u.login, name: u.name || u.login, avatarUrl: u.avatar_url || '', followers: u.followers || 0 };
          }
        }
        if (login && !reposForMeta.length) {
          const rList = await ghJson(`${GITHUB_API}/users/${encodeURIComponent(login)}/repos?sort=pushed&per_page=8`, { headers });
          if (Array.isArray(rList)) {
            reposForMeta = rList.map(r => ({ nameWithOwner: r.full_name, stargazerCount: r.stargazers_count || 0, url: r.html_url }));
          }
        }

        if (login) {
          const [prRes, issRes, evRes] = await Promise.all([
            ghJson(`${GITHUB_API}/search/issues?q=${encodeURIComponent(`is:pr is:open involves:${login}`)}&per_page=10`, { headers }),
            ghJson(`${GITHUB_API}/search/issues?q=${encodeURIComponent(`is:issue is:open involves:${login}`)}&per_page=10`, { headers }),
            ghJson(`${GITHUB_API}/users/${encodeURIComponent(login)}/received_events?per_page=25`, { headers })
          ]);
          prs = (prRes?.items || []).map(item => ({
            number: item.number,
            title: String(item.title || '').slice(0, 90),
            repo: String(item.repository_url || '').split('/repos/')[1] || '',
            url: item.html_url,
            draft: Boolean(item.draft),
            updatedAt: item.updated_at
          }));
          issues = (issRes?.items || []).map(item => ({
            number: item.number,
            title: String(item.title || '').slice(0, 90),
            repo: String(item.repository_url || '').split('/repos/')[1] || '',
            url: item.html_url,
            comments: item.comments || 0,
            updatedAt: item.updated_at
          }));
          var following = (Array.isArray(evRes) ? evRes : [])
            .filter(ev => ev.actor?.login && ev.actor.login.toLowerCase() !== login.toLowerCase())
            .map(summarizeEvent)
            .filter(Boolean)
            .slice(0, 14);
        } else {
          var following = [];
        }

        // Recent stargazers across top starred repos + Actions workflow runs across recent repos
        const starRepos = reposForMeta.filter(r => r.stargazerCount > 0).slice(0, 4);
        const actionRepos = reposForMeta.slice(0, 3);
        const [starLists, actionLists] = await Promise.all([
          Promise.all(starRepos.map(async r => {
            const lastPage = Math.max(1, Math.ceil(r.stargazerCount / 30));
            const list = await ghJson(`${GITHUB_API}/repos/${r.nameWithOwner}/stargazers?per_page=30&page=${lastPage}`, {
              headers: { ...headers, Accept: 'application/vnd.github.star+json' }
            });
            return (Array.isArray(list) ? list : []).map(s => ({
              user: s.user?.login || '',
              avatarUrl: s.user?.avatar_url || '',
              repo: r.nameWithOwner,
              url: s.user?.html_url || r.url,
              starredAt: s.starred_at || ''
            }));
          })),
          auth.token ? Promise.all(actionRepos.map(async r => {
            const runs = await ghJson(`${GITHUB_API}/repos/${r.nameWithOwner}/actions/runs?per_page=3`, { headers });
            return (runs?.workflow_runs || []).map(run => ({
              id: run.id,
              repo: r.nameWithOwner,
              name: run.name || 'Workflow',
              branch: run.head_branch || '',
              status: run.status || '',
              conclusion: run.conclusion || '',
              url: run.html_url || r.url,
              updatedAt: run.updated_at || ''
            }));
          })) : Promise.resolve([])
        ]);

        const stargazers = starLists.flat()
          .filter(s => s.user)
          .sort((a, b) => String(b.starredAt).localeCompare(String(a.starredAt)))
          .slice(0, 12);

        const actions = actionLists.flat()
          .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
          .slice(0, 10);

        for (const run of actions) {
          const prev = lastRunStates.get(run.id);
          if (prev === 'in_progress' && run.status === 'completed') {
            send?.('extras:toast', { text: `CI ${run.conclusion === 'success' ? 'OK' : run.conclusion || 'DONE'}: ${run.repo}` });
          }
          lastRunStates.set(run.id, run.status);
        }

        const todayLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const streakInfo = computeContributionStreaks(days, todayLocal);
        if (totalFromGql > streakInfo.totalYear) streakInfo.totalYear = totalFromGql;

        const daysWindow = weeks.slice(-22).flat();
        const data = {
          ok: Boolean(profile),
          error: !login ? 'no_username' : (!profile ? 'github_unreachable' : ''),
          connected: Boolean(profile),
          authSource: auth.source,
          username: profile?.login || login || '',
          profile,
          contributions: {
            ...streakInfo,
            weeks: weeks.slice(-22)
          },
          currentStreak: streakInfo.currentStreak || 0,
          longestStreak: streakInfo.longestStreak || 0,
          totalContributions: streakInfo.totalYear || 0,
          days: daysWindow,
          prs,
          issues,
          stargazers,
          following,
          followingEvents: following,
          actions,
          workflowRuns: actions,
          fetchedAt: Date.now()
        };
        cache = { at: Date.now(), data };
        writeJson('github-cache.json', cache);
        return data;
      } finally {
        pendingFetch = null;
      }
    })();

    return pendingFetch;
  }

  handleBoth('github:config-get', async () => {
    const auth = await resolveAuth();
    return {
      username: auth.username || cfg.username || '',
      hasToken: Boolean(decrypt(cfg.tokenEnc)),
      hasManualToken: Boolean(decrypt(cfg.tokenEnc)),
      hasGhCli: Boolean(ghCliToken),
      ghCliUser: auth.source === 'gh_cli' ? (auth.username || '') : '',
      authSource: auth.source
    };
  });

  handleBoth('github:config-set', async payload => {
    if (typeof payload?.username === 'string') cfg.username = payload.username.trim().slice(0, 60);
    if (payload?.clearToken) cfg.tokenEnc = '';
    else if (typeof payload?.token === 'string' && payload.token.trim()) cfg.tokenEnc = encrypt(payload.token.trim().slice(0, 300));
    writeJson('github-config.json', cfg);
    cache = null;
    const summary = await fetchSummary(true).catch(() => null);
    const auth = await resolveAuth();
    return {
      username: auth.username || cfg.username || '',
      hasToken: Boolean(decrypt(cfg.tokenEnc)),
      hasManualToken: Boolean(decrypt(cfg.tokenEnc)),
      hasGhCli: Boolean(ghCliToken),
      ghCliUser: auth.source === 'gh_cli' ? (auth.username || '') : '',
      authSource: auth.source,
      summary
    };
  });

  handleBoth('github:summary', async payload => {
    const summary = await fetchSummary(Boolean(payload?.force));
    return { ...summary, summary };
  });

  return { fetchSummary };
}

module.exports = { setupGitHub, computeContributionStreaks, summarizeEvent };

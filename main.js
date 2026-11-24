delete process.env.ELECTRON_RUN_AS_NODE;
require('./src/main/tray-main.cjs'); // first: tray icon + only one LumaDock at a time
require('./src/main/island-window-main');
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  safeStorage,
  screen,
  dialog,
  clipboard
} = require('electron');

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const { spawn, exec } = require('child_process');
const { StringDecoder } = require('string_decoder');
const {
  DEFAULT_SPOTIFY_CLIENT_ID,
  getDefaultSpotifyClientId,
  isValidSpotifyClientId,
  hasSpotifyPlaylistScope,
  normalizeTrackMeta,
  buildLyricsQueries,
  parseLrcLines,
  classifySpotifyPlaylistsError,
  renderSpotifyCallbackHtml,
  parseSpotifyPlaylistInput,
  collectPagedSpotifyTracks,
  collectPagedSpotifyPlaylists
} = require('./src/main/spotify-helpers.cjs');
const i18n = require('./src/shared/i18n.cjs');

require('./src/main/project-mode-main');
require('./src/main/ai-monitor-main.cjs');
require('./src/main/extras-main.cjs');
require('./src/main/settings-app-main.cjs'); // LumaDock Settings: settings as their own app
require('./src/main/license-main.cjs'); // packs bought on lumadock.app: which extra apps are open

if (process.platform === 'win32') {
  app.setAppUserModelId(
    'com.lumadock.assistant'
  );
}


// ============================================================
// WINDOW
// ============================================================

const PANEL_WIDTH = 860; // wide and low, like NotchNook
const PANEL_HEIGHT = 320;

let mascotWindow = null;
let pointerTimer = null;
let mascotInteractive = false;


// ============================================================
// LUMADOCK
// ============================================================

const API_BASE =
  'https://lumadock.app/wp-json/lumadock/v1/companion';


const CONNECTION_FILE = () =>
  path.join(
    app.getPath('userData'),
    'lumadock-connection.json'
  );


// ============================================================
// PROJECT MODE
// ============================================================

const PROJECT_FILE = () =>
  path.join(
    app.getPath('userData'),
    'lumadock-project.json'
  );


const PROJECT_MAX_FILES = 5000;

const PROJECT_MAX_DEPTH = 18;

const PROJECT_SEARCH_MAX_FILES = 1200;

const PROJECT_SEARCH_MAX_TOTAL_BYTES =
  60 * 1024 * 1024;

const PROJECT_MAX_SINGLE_FILE_BYTES =
  1024 * 1024;

const PROJECT_READ_MAX_BYTES =
  2 * 1024 * 1024;


// directories that should never be scanned
const PROJECT_IGNORE_DIRECTORIES =
  new Set([
    'node_modules',
    '.git',
    '.svn',
    '.hg',

    'dist',
    'build',
    'out',
    'coverage',

    '.next',
    '.nuxt',

    '.cache',
    '.parcel-cache',

    '.idea',
    '.vscode',

    'vendor',

    '__pycache__',
    '.pytest_cache',

    'target'
  ]);


// huge/generated files that are not useful for code search
const PROJECT_IGNORE_FILES =
  new Set([
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'composer.lock',
    'cargo.lock'
  ]);


const PROJECT_TEXT_EXTENSIONS =
  new Set([
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',

    '.ts',
    '.tsx',

    '.html',
    '.htm',

    '.css',
    '.scss',
    '.sass',
    '.less',

    '.json',

    '.md',
    '.mdx',

    '.txt',

    '.xml',

    '.yaml',
    '.yml',

    '.vue',
    '.svelte',

    '.php',

    '.py',

    '.rb',

    '.java',
    '.kt',
    '.kts',

    '.go',

    '.rs',

    '.cs',

    '.c',
    '.cpp',
    '.cc',
    '.h',
    '.hpp',

    '.swift',

    '.sql',

    '.sh',
    '.bash',

    '.ps1',

    '.bat',
    '.cmd'
  ]);


// ============================================================
// PROJECT SECURITY
// ============================================================

function isSensitiveProjectFile(
  filename
) {
  const name =
    String(
      filename ||
      ''
    ).toLowerCase();


  if (
    name ===
    '.env'
  ) {
    return true;
  }


  if (
    name.startsWith(
      '.env.'
    )
  ) {
    return true;
  }


  const blockedNames = [
    'credentials.json',
    'credentials.yml',
    'credentials.yaml',

    'secrets.json',
    'secrets.yml',
    'secrets.yaml',

    'secret.json',

    'id_rsa',
    'id_ed25519',

    '.npmrc',

    '.pypirc'
  ];


  if (
    blockedNames.includes(
      name
    )
  ) {
    return true;
  }


  const extension =
    path.extname(
      name
    );


  return [
    '.pem',
    '.key',
    '.p12',
    '.pfx',
    '.jks'
  ].includes(
    extension
  );
}


function isProjectTextFile(
  filename
) {
  const name =
    String(
      filename ||
      ''
    ).toLowerCase();


  if (
    isSensitiveProjectFile(
      name
    )
  ) {
    return false;
  }


  if (
    PROJECT_IGNORE_FILES.has(
      name
    )
  ) {
    return false;
  }


  if (
    name ===
    'dockerfile'
  ) {
    return true;
  }


  if (
    name ===
    'makefile'
  ) {
    return true;
  }


  if (
    name ===
    '.gitignore'
  ) {
    return true;
  }


  const extension =
    path.extname(
      name
    );


  return PROJECT_TEXT_EXTENSIONS.has(
    extension
  );
}


function normalizePathCompare(
  value
) {
  const normalized =
    path.resolve(
      value
    );


  if (
    process.platform ===
    'win32'
  ) {
    return normalized.toLowerCase();
  }


  return normalized;
}


function pathIsInside(
  root,
  candidate
) {
  const rootNormalized =
    normalizePathCompare(
      root
    );


  const candidateNormalized =
    normalizePathCompare(
      candidate
    );


  return (
    candidateNormalized ===
      rootNormalized ||
    candidateNormalized.startsWith(
      rootNormalized +
      path.sep
    )
  );
}


// ============================================================
// PROJECT STORAGE
// ============================================================

function saveProjectSelection(
  rootPath
) {
  writeJson(
    PROJECT_FILE(),
    {
      rootPath
    }
  );
}


function loadProjectSelection() {
  const saved =
    readJson(
      PROJECT_FILE()
    );


  const rootPath =
    saved?.rootPath;


  if (
    !rootPath ||
    typeof rootPath !==
    'string'
  ) {
    return null;
  }


  try {
    const stat =
      fs.statSync(
        rootPath
      );


    if (
      !stat.isDirectory()
    ) {
      return null;
    }


    return rootPath;

  } catch {
    return null;
  }
}


// ============================================================
// PROJECT SCAN
// ============================================================

function incrementMap(
  map,
  key
) {
  if (!key) {
    return;
  }


  map.set(
    key,
    (
      map.get(
        key
      ) ||
      0
    ) +
    1
  );
}


function detectProjectTechnology(
  rootPath,
  extensionCounts
) {
  let packageJson =
    null;


  const packagePath =
    path.join(
      rootPath,
      'package.json'
    );


  try {
    if (
      fs.existsSync(
        packagePath
      )
    ) {
      packageJson =
        JSON.parse(
          fs.readFileSync(
            packagePath,
            'utf8'
          )
        );
    }
  } catch {}


  const dependencies = {
    ...(
      packageJson?.dependencies ||
      {}
    ),

    ...(
      packageJson?.devDependencies ||
      {}
    )
  };


  const has =
    name =>
      Boolean(
        dependencies[
          name
        ]
      );


  const tsCount =
    (
      extensionCounts.get(
        '.ts'
      ) ||
      0
    ) +
    (
      extensionCounts.get(
        '.tsx'
      ) ||
      0
    );


  const jsCount =
    (
      extensionCounts.get(
        '.js'
      ) ||
      0
    ) +
    (
      extensionCounts.get(
        '.jsx'
      ) ||
      0
    ) +
    (
      extensionCounts.get(
        '.mjs'
      ) ||
      0
    ) +
    (
      extensionCounts.get(
        '.cjs'
      ) ||
      0
    );


  const language =
    tsCount >
    jsCount
      ?
        'TypeScript'
      :
      jsCount >
      0
        ?
          'JavaScript'
        :
          '';


  if (
    has(
      'electron'
    )
  ) {
    return language
      ?
        `Electron · ${language}`
      :
        'Electron';
  }


  if (
    has(
      '@tauri-apps/api'
    ) ||
    fs.existsSync(
      path.join(
        rootPath,
        'src-tauri'
      )
    )
  ) {
    return language
      ?
        `Tauri · ${language}`
      :
        'Tauri';
  }


  if (
    has(
      'next'
    )
  ) {
    return language
      ?
        `Next.js · ${language}`
      :
        'Next.js';
  }


  if (
    has(
      'react'
    )
  ) {
    return language
      ?
        `React · ${language}`
      :
        'React';
  }


  if (
    has(
      'vue'
    )
  ) {
    return language
      ?
        `Vue · ${language}`
      :
        'Vue';
  }


  if (
    packageJson
  ) {
    return language ||
      'Node.js';
  }


  if (
    (
      extensionCounts.get(
        '.php'
      ) ||
      0
    ) >
    0
  ) {
    return 'PHP';
  }


  if (
    (
      extensionCounts.get(
        '.py'
      ) ||
      0
    ) >
    0
  ) {
    return 'Python';
  }


  if (
    (
      extensionCounts.get(
        '.rs'
      ) ||
      0
    ) >
    0
  ) {
    return 'Rust';
  }


  if (
    (
      extensionCounts.get(
        '.java'
      ) ||
      0
    ) >
    0
  ) {
    return 'Java';
  }


  if (
    (
      extensionCounts.get(
        '.cs'
      ) ||
      0
    ) >
    0
  ) {
    return 'C#';
  }


  return 'Project';
}


async function scanProject(
  inputRoot
) {
  if (
    !inputRoot
  ) {
    return {
      ok: true,
      selected: false
    };
  }


  let rootPath;


  try {
    rootPath =
      await fs.promises.realpath(
        inputRoot
      );

  } catch {
    return {
      ok: false,
      selected: false,

      error:
        i18n.t('project.errors.folderMissing')
    };
  }


  let rootStat;


  try {
    rootStat =
      await fs.promises.stat(
        rootPath
      );

  } catch {
    return {
      ok: false,
      selected: false,

      error:
        i18n.t('project.errors.folderUnreadable')
    };
  }


  if (
    !rootStat.isDirectory()
  ) {
    return {
      ok: false,
      selected: false,

      error:
        i18n.t('project.errors.notAFolder')
    };
  }


  let fileCount =
    0;

  let folderCount =
    0;

  let ignoredCount =
    0;

  let textFileCount =
    0;

  let truncated =
    false;


  const extensionCounts =
    new Map();


  async function walk(
    directory,
    depth
  ) {
    if (
      truncated ||
      depth >
      PROJECT_MAX_DEPTH
    ) {
      return;
    }


    let entries;


    try {
      entries =
        await fs.promises.readdir(
          directory,
          {
            withFileTypes:
              true
          }
        );

    } catch {
      ignoredCount++;

      return;
    }


    for (
      const entry of entries
    ) {
      if (
        fileCount >=
        PROJECT_MAX_FILES
      ) {
        truncated =
          true;

        return;
      }


      if (
        entry.isSymbolicLink()
      ) {
        ignoredCount++;

        continue;
      }


      if (
        entry.isDirectory()
      ) {
        if (
          PROJECT_IGNORE_DIRECTORIES.has(
            entry.name
          )
        ) {
          ignoredCount++;

          continue;
        }


        folderCount++;


        await walk(
          path.join(
            directory,
            entry.name
          ),

          depth +
          1
        );


        continue;
      }


      if (
        !entry.isFile()
      ) {
        continue;
      }


      if (
        isSensitiveProjectFile(
          entry.name
        )
      ) {
        ignoredCount++;

        continue;
      }


      fileCount++;


      if (
        isProjectTextFile(
          entry.name
        )
      ) {
        textFileCount++;
      }


      const extension =
        path.extname(
          entry.name
        ).toLowerCase();


      incrementMap(
        extensionCounts,
        extension
      );
    }
  }


  await walk(
    rootPath,
    0
  );


  const git =
    fs.existsSync(
      path.join(
        rootPath,
        '.git'
      )
    );


  const technology =
    detectProjectTechnology(
      rootPath,
      extensionCounts
    );


  return {
    ok: true,
    selected: true,

    name:
      path.basename(
        rootPath
      ),

    path:
      rootPath,

    technology,

    git,

    fileCount,
    textFileCount,
    folderCount,
    ignoredCount,

    truncated,

    maxFiles:
      PROJECT_MAX_FILES,

    scannedAt:
      Date.now()
  };
}


async function getCurrentProject() {
  const rootPath =
    loadProjectSelection();


  if (!rootPath) {
    return {
      ok: true,
      selected: false
    };
  }


  return scanProject(
    rootPath
  );
}


async function chooseProject() {
  const currentPath =
    loadProjectSelection();


  const options = {
    title:
      i18n.t('project.chooseTitle'),

    defaultPath:
      currentPath ||
      app.getPath(
        'documents'
      ),

    buttonLabel:
      i18n.t('project.chooseButton'),

    properties: [
      'openDirectory'
    ]
  };


  const result =
    mascotWindow &&
    !mascotWindow.isDestroyed()
      ?
        await dialog.showOpenDialog(
          mascotWindow,
          options
        )
      :
        await dialog.showOpenDialog(
          options
        );


  if (
    result.canceled ||
    !result.filePaths?.[0]
  ) {
    return {
      ok: true,
      cancelled: true
    };
  }


  let rootPath;


  try {
    rootPath =
      await fs.promises.realpath(
        result.filePaths[0]
      );

  } catch {
    return {
      ok: false,

      error:
        i18n.t('project.errors.folderOpenFailed')
    };
  }


  saveProjectSelection(
    rootPath
  );


  return scanProject(
    rootPath
  );
}


// ============================================================
// PROJECT SEARCH FILE COLLECTION
// ============================================================

async function collectProjectTextFiles(
  rootPath
) {
  const files =
    [];


  let totalBytes =
    0;

  let truncated =
    false;


  async function walk(
    directory,
    depth
  ) {
    if (
      truncated ||
      depth >
      PROJECT_MAX_DEPTH
    ) {
      return;
    }


    let entries;


    try {
      entries =
        await fs.promises.readdir(
          directory,
          {
            withFileTypes:
              true
          }
        );

    } catch {
      return;
    }


    entries.sort(
      (
        a,
        b
      ) =>
        a.name.localeCompare(
          b.name
        )
    );


    for (
      const entry of entries
    ) {
      if (
        files.length >=
        PROJECT_SEARCH_MAX_FILES ||
        totalBytes >=
        PROJECT_SEARCH_MAX_TOTAL_BYTES
      ) {
        truncated =
          true;

        return;
      }


      if (
        entry.isSymbolicLink()
      ) {
        continue;
      }


      const fullPath =
        path.join(
          directory,
          entry.name
        );


      if (
        entry.isDirectory()
      ) {
        if (
          PROJECT_IGNORE_DIRECTORIES.has(
            entry.name
          )
        ) {
          continue;
        }


        await walk(
          fullPath,
          depth +
          1
        );


        continue;
      }


      if (
        !entry.isFile()
      ) {
        continue;
      }


      if (
        !isProjectTextFile(
          entry.name
        )
      ) {
        continue;
      }


      let stat;


      try {
        stat =
          await fs.promises.stat(
            fullPath
          );

      } catch {
        continue;
      }


      if (
        stat.size >
        PROJECT_MAX_SINGLE_FILE_BYTES
      ) {
        continue;
      }


      if (
        totalBytes +
        stat.size >
        PROJECT_SEARCH_MAX_TOTAL_BYTES
      ) {
        truncated =
          true;

        return;
      }


      totalBytes +=
        stat.size;


      files.push({
        fullPath,

        relativePath:
          path
            .relative(
              rootPath,
              fullPath
            )
            .replace(
              /\\/g,
              '/'
            ),

        size:
          stat.size
      });
    }
  }


  await walk(
    rootPath,
    0
  );


  return {
    files,
    truncated
  };
}


// ============================================================
// PROJECT QUERY
// ============================================================

const PROJECT_STOP_WORDS =
  new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'where', 'what', 'which', 'how',
    'can', 'could', 'would', 'should', 'make', 'fix', 'find', 'show', 'get', 'code', 'file', 'files',
    'bir', 'bu', 've', 'ile', 'icin', 'nerede', 'nasil', 'nedir', 'hangi', 'dosya', 'dosyalar', 'kod'
  ]);


const PROJECT_QUERY_EXPANSIONS = {
  spotify: ['spotify', 'player', 'playback', 'track'],
  play: ['play', 'pause', 'playing', 'control'],
  button: ['button', 'control', 'hit', 'click'],
  dugme: ['button', 'control', 'hit', 'click'],
  buton: ['button', 'control', 'hit', 'click'],
  wave: ['wave', 'waveform', 'bars', 'audio'],
  waves: ['wave', 'waveform', 'bars', 'audio'],
  sound: ['sound', 'audio', 'speaker', 'volume'],
  ses: ['sound', 'audio', 'speaker', 'volume'],
  album: ['album', 'cover', 'image', 'image_url'],
  cover: ['cover', 'album', 'image', 'image_url'],
  kapak: ['cover', 'album', 'image', 'image_url'],
  settings: ['settings', 'setting', 'config'],
  ayarlar: ['settings', 'setting', 'config'],
  mascot: ['ghost', 'mascot'],
  robo: ['ghost', 'mascot', 'robo'],
  menu: ['menu', 'home', 'apps', 'view'],
  project: ['project'],
  proje: ['project'],
  animation: ['animation', 'animate', 'transition', 'motion'],
  animasyon: ['animation', 'animate', 'transition', 'motion'],
  hover: ['hover', 'mousemove', 'pointer', 'mouseenter', 'mouseleave'],
  click: ['click', 'onclick', 'pointerdown', 'hit'],
  tikla: ['click', 'onclick', 'pointerdown', 'hit']
};


function normalizeSearchText(
  value
) {
  return String(
    value ||
    ''
  )
    .normalize(
      'NFD'
    )
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase();
}


function buildProjectSearchTerms(
  query
) {
  const normalized =
    normalizeSearchText(
      query
    );


  const rawTerms =
    normalized.match(
      /[a-z0-9_$.-]+/g
    ) ||
    [];


  const terms =
    new Set();


  for (
    const rawTerm of rawTerms
  ) {
    const term =
      rawTerm.trim();


    if (
      term.length <
      2
    ) {
      continue;
    }


    if (
      PROJECT_STOP_WORDS.has(
        term
      )
    ) {
      continue;
    }


    terms.add(
      term
    );


    const directExpansion =
      PROJECT_QUERY_EXPANSIONS[
        term
      ];


    if (
      directExpansion
    ) {
      for (
        const expanded of directExpansion
      ) {
        terms.add(
          expanded
        );
      }
    }


    for (
      const [
        key,
        expansion
      ] of Object.entries(
        PROJECT_QUERY_EXPANSIONS
      )
    ) {
      if (
        term.startsWith(
          key
        ) &&
        key.length >=
        4
      ) {
        for (
          const expanded of expansion
        ) {
          terms.add(
            expanded
          );
        }
      }
    }
  }


  return Array.from(
    terms
  ).slice(
    0,
    20
  );
}


// ============================================================
// PROJECT SEARCH
// ============================================================

function countOccurrences(
  text,
  term
) {
  if (
    !text ||
    !term
  ) {
    return 0;
  }


  let count =
    0;


  let position =
    0;


  while (true) {
    const index =
      text.indexOf(
        term,
        position
      );


    if (
      index ===
      -1
    ) {
      break;
    }


    count++;


    if (
      count >=
      30
    ) {
      break;
    }


    position =
      index +
      term.length;
  }


  return count;
}


function cleanSnippet(
  value
) {
  return String(
    value ||
    ''
  )
    .replace(
      /\t/g,
      '  '
    )
    .trimEnd()
    .slice(
      0,
      260
    );
}


async function searchProject(
  query
) {
  const selectedRoot =
    loadProjectSelection();


  if (
    !selectedRoot
  ) {
    return {
      ok: false,
      error:
        i18n.t('project.errors.pickProjectFirst')
    };
  }


  const trimmedQuery =
    String(
      query ||
      ''
    ).trim();


  if (
    !trimmedQuery
  ) {
    return {
      ok: false,

      error:
        i18n.t('project.errors.typeSearchFirst')
    };
  }


  let rootPath;


  try {
    rootPath =
      await fs.promises.realpath(
        selectedRoot
      );

  } catch {
    return {
      ok: false,

      error:
        i18n.t('project.errors.folderMissing')
    };
  }


  const terms =
    buildProjectSearchTerms(
      trimmedQuery
    );


  if (
    terms.length ===
    0
  ) {
    return {
      ok: false,

      error:
        i18n.t('project.errors.noSearchTerms')
    };
  }


  const collected =
    await collectProjectTextFiles(
      rootPath
    );


  const results =
    [];


  const phrase =
    normalizeSearchText(
      trimmedQuery
    );


  for (
    const file of collected.files
  ) {
    let content;


    try {
      content =
        await fs.promises.readFile(
          file.fullPath,
          'utf8'
        );

    } catch {
      continue;
    }


    const contentLower =
      normalizeSearchText(
        content
      );


    const pathLower =
      normalizeSearchText(
        file.relativePath
      );


    let score =
      0;


    const matchedTerms =
      [];


    for (
      const term of terms
    ) {
      let termScore =
        0;


      if (
        pathLower.includes(
          term
        )
      ) {
        termScore +=
          24;
      }


      const occurrences =
        countOccurrences(
          contentLower,
          term
        );


      if (
        occurrences >
        0
      ) {
        termScore +=
          Math.min(
            30,
            occurrences *
            3
          );
      }


      if (
        termScore >
        0
      ) {
        matchedTerms.push(
          term
        );


        score +=
          termScore;
      }
    }


    if (
      phrase.length >=
        5 &&
      contentLower.includes(
        phrase
      )
    ) {
      score +=
        40;
    }


    if (
      phrase.length >=
        5 &&
      pathLower.includes(
        phrase
      )
    ) {
      score +=
        60;
    }


    if (
      score <=
      0
    ) {
      continue;
    }


    const lines =
      content.split(
        /\r?\n/
      );


    const lineMatches =
      [];


    for (
      let index = 0;
      index <
      lines.length;
      index++
    ) {
      const line =
        lines[
          index
        ];


      const lineLower =
        normalizeSearchText(
          line
        );


      let lineScore =
        0;


      const lineTerms =
        [];


      for (
        const term of terms
      ) {
        if (
          lineLower.includes(
            term
          )
        ) {
          lineScore +=
            5;


          lineTerms.push(
            term
          );
        }
      }


      if (
        lineScore ===
        0
      ) {
        continue;
      }


      if (
        /\b(function|class|const|let|var|ipcMain|ipcRenderer|function\s+draw|async\s+function)\b/i.test(
          line
        )
      ) {
        lineScore +=
          2;
      }


      lineMatches.push({
        line:
          index +
          1,

        text:
          cleanSnippet(
            line
          ),

        score:
          lineScore,

        terms:
          lineTerms.slice(
            0,
            6
          )
      });
    }


    lineMatches.sort(
      (
        a,
        b
      ) =>
        b.score -
        a.score
    );


    results.push({
      file:
        file.relativePath,

      size:
        file.size,

      score,

      matchedTerms:
        Array.from(
          new Set(
            matchedTerms
          )
        ).slice(
          0,
          8
        ),

      matches:
        lineMatches.slice(
          0,
          3
        )
    });
  }


  results.sort(
    (
      a,
      b
    ) => {
      if (
        b.score !==
        a.score
      ) {
        return (
          b.score -
          a.score
        );
      }


      return a.file.localeCompare(
        b.file
      );
    }
  );


  return {
    ok: true,

    query:
      trimmedQuery,

    terms,

    searchedFiles:
      collected.files.length,

    truncated:
      collected.truncated,

    count:
      results.length,

    results:
      results.slice(
        0,
        8
      )
  };
}


// ============================================================
// PROJECT READ
// ============================================================

async function resolveProjectFile(
  relativeFile
) {
  const selectedRoot =
    loadProjectSelection();


  if (
    !selectedRoot
  ) {
    throw new Error(
      i18n.t('project.errors.noProjectSelected')
    );
  }


  const rootPath =
    await fs.promises.realpath(
      selectedRoot
    );


  const supplied =
    String(
      relativeFile ||
      ''
    );


  if (
    !supplied ||
    path.isAbsolute(
      supplied
    )
  ) {
    throw new Error(
      i18n.t('project.errors.invalidFile')
    );
  }


  const candidate =
    path.resolve(
      rootPath,
      supplied
    );


  if (
    !pathIsInside(
      rootPath,
      candidate
    )
  ) {
    throw new Error(
      i18n.t('project.errors.outsideProject')
    );
  }


  let realFile;


  try {
    realFile =
      await fs.promises.realpath(
        candidate
      );

  } catch {
    throw new Error(
      i18n.t('project.errors.fileMissing')
    );
  }


  if (
    !pathIsInside(
      rootPath,
      realFile
    )
  ) {
    throw new Error(
      i18n.t('project.errors.outsideProject')
    );
  }


  const filename =
    path.basename(
      realFile
    );


  if (
    isSensitiveProjectFile(
      filename
    )
  ) {
    throw new Error(
      i18n.t('project.errors.sensitiveFileBlocked')
    );
  }


  if (
    !isProjectTextFile(
      filename
    )
  ) {
    throw new Error(
      i18n.t('project.errors.unsupportedFileType')
    );
  }


  const stat =
    await fs.promises.stat(
      realFile
    );


  if (
    !stat.isFile()
  ) {
    throw new Error(
      i18n.t('project.errors.notAFile')
    );
  }


  if (
    stat.size >
    PROJECT_READ_MAX_BYTES
  ) {
    throw new Error(
      i18n.t('project.errors.fileTooLarge')
    );
  }


  return {
    rootPath,
    realFile,

    relativePath:
      path
        .relative(
          rootPath,
          realFile
        )
        .replace(
          /\\/g,
          '/'
        )
  };
}


async function readProjectFile(
  file,
  requestedLine = 1
) {
  let resolved;


  try {
    resolved =
      await resolveProjectFile(
        file
      );

  } catch (error) {
    if (process.platform === 'win32') {
      const vkMap = { play: 179, pause: 179, next: 176, previous: 177 };
      if (vkMap[action]) {
        try {
          exec(`powershell -NoProfile -NonInteractive -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]${vkMap[action]})"`);
          return { ok: true };
        } catch {}
      }
    }
    return {
      ok: false,
      error: error.message
    };
  }


  let content;


  try {
    content =
      await fs.promises.readFile(
        resolved.realFile,
        'utf8'
      );

  } catch {
    return {
      ok: false,

      error:
        i18n.t('project.errors.fileReadError')
    };
  }


  const sourceLines =
    content.split(
      /\r?\n/
    );


  const totalLines =
    sourceLines.length;


  const focusLine =
    clampNumber(
      Number(
        requestedLine
      ) ||
      1,

      1,
      Math.max(
        1,
        totalLines
      )
    );


  const radius =
    7;


  const startLine =
    Math.max(
      1,
      focusLine -
      radius
    );


  const endLine =
    Math.min(
      totalLines,
      focusLine +
      radius
    );


  const lines =
    [];


  for (
    let lineNumber =
      startLine;

    lineNumber <=
      endLine;

    lineNumber++
  ) {
    lines.push({
      number:
        lineNumber,

      text:
        sourceLines[
          lineNumber -
          1
        ] ||
        ''
    });
  }


  return {
    ok: true,

    file:
      resolved.relativePath,

    focusLine,

    startLine,
    endLine,
    totalLines,

    lines
  };
}


function clampNumber(
  value,
  min,
  max
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}


// ============================================================
// SPOTIFY
// ============================================================

const SPOTIFY_REDIRECT_URI =
  'http://127.0.0.1:8888/callback';


const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-playback-position',
  'playlist-read-private',
  'playlist-read-collaborative'
].join(' ');


const SPOTIFY_TOKEN_FILE = () =>
  path.join(
    app.getPath('userData'),
    'spotify-tokens.json'
  );

const SPOTIFY_CONFIG_FILE = () =>
  path.join(
    app.getPath('userData'),
    'spotify-config.json'
  );

function getSpotifyClientId() {
  const envId = String(process.env.LUMADOCK_SPOTIFY_CLIENT_ID || '').trim();
  if (isValidSpotifyClientId(envId)) return envId;
  const saved = readJson(SPOTIFY_CONFIG_FILE());
  const custom = String(saved?.clientId || '').trim();
  if (isValidSpotifyClientId(custom)) return custom;
  return getDefaultSpotifyClientId() || DEFAULT_SPOTIFY_CLIENT_ID;
}

function isCustomSpotifyClientId() {
  const saved = readJson(SPOTIFY_CONFIG_FILE());
  const custom = String(saved?.clientId || '').trim();
  const baseId = getDefaultSpotifyClientId() || DEFAULT_SPOTIFY_CLIENT_ID;
  return isValidSpotifyClientId(custom) && custom !== baseId;
}

function setSpotifyClientId(clientId) {
  const trimmed = String(clientId || '').trim();
  const baseId = getDefaultSpotifyClientId() || DEFAULT_SPOTIFY_CLIENT_ID;
  if (!trimmed) {
    try { fs.unlinkSync(SPOTIFY_CONFIG_FILE()); } catch {}
    clearSpotifyTokens();
    playlistsCache = null;
    if (mascotWindow && !mascotWindow.isDestroyed()) {
      try { mascotWindow.webContents.send('spotify:auth-updated', { connected: false, isCustom: false }); } catch {}
    }
    return { ok: true, clientId: getSpotifyClientId(), isCustom: false };
  }
  if (!isValidSpotifyClientId(trimmed)) {
    return { ok: false, error: i18n.t('spotify.errors.invalidClientId') };
  }
  writeJson(SPOTIFY_CONFIG_FILE(), { clientId: trimmed });
  clearSpotifyTokens();
  playlistsCache = null;
  const isCustom = trimmed !== baseId;
  if (mascotWindow && !mascotWindow.isDestroyed()) {
    try { mascotWindow.webContents.send('spotify:auth-updated', { connected: false, isCustom }); } catch {}
  }
  return { ok: true, clientId: trimmed, isCustom };
}


let spotifyAuthPromise = null;
let spotifyRefreshPromise = null;
let spotifyRateLimitedUntil = 0;

// Windows GlobalSystemMediaTransportControls (Spotify desktop & browser media)
let latestWindowsMedia = null;
let mediaWatchChild = null;
const artworkCache = new Map();
const artworkInFlight = new Set();

const mediaCmdFile = path.join(os.tmpdir(), 'lumadock-media-cmd.txt');

function sendMediaCommand(cmd) {
  try {
    fs.writeFileSync(mediaCmdFile, String(cmd).trim(), 'utf8');
  } catch {}
  if (mediaWatchChild && mediaWatchChild.stdin && !mediaWatchChild.stdin.destroyed) {
    try {
      mediaWatchChild.stdin.write(cmd + '\n');
    } catch {}
  }
}

async function fetchTrackArtwork(title, artist) {
  if (!title) return '';
  const cacheKey = `${title}:::${artist || ''}`.toLowerCase();
  if (artworkCache.has(cacheKey) && artworkCache.get(cacheKey)) {
    return artworkCache.get(cacheKey);
  }
  if (artworkInFlight.has(cacheKey)) return '';
  artworkInFlight.add(cacheKey);

  const clean = normalizeTrackMeta(title, artist);
  let cover = '';
  // 1. iTunes Search API (fast, 600x600 HD artwork, no auth required)
  try {
    const shortTitle = clean.title.replace(/\s*[\(\[].*$/, '').trim() || clean.title;
    const term = encodeURIComponent(`${shortTitle} ${clean.artist || ''}`.trim());
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=1`, {
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data = await res.json();
      const song = data.results?.[0];
      if (song && song.artworkUrl100) {
        cover = song.artworkUrl100.replace('100x100bb', '600x600bb');
      }
    }
  } catch {}

  // 2. Spotify Search API if tokens exist and iTunes had no result
  if (!cover) {
    try {
      if (loadSpotifyTokens()) {
        const q = encodeURIComponent(`track:${clean.title} artist:${clean.artist || ''}`);
        const data = await spotifyApi(`/v1/search?type=track&q=${q}&limit=1`);
        const track = data?.tracks?.items?.[0];
        cover = track?.album?.images?.[0]?.url || '';
      }
    } catch {}
  }

  artworkInFlight.delete(cacheKey);
  if (cover) {
    artworkCache.set(cacheKey, cover);
    if (mascotWindow && !mascotWindow.isDestroyed()) {
      mascotWindow.webContents.send('media:artwork-loaded', { title, artist, cover });
    }
  }
  return cover;
}

function getArtworkOrFetchBackground(title, artist) {
  if (!title) return '';
  const cacheKey = `${title}:::${artist || ''}`.toLowerCase();
  if (artworkCache.has(cacheKey)) {
    return artworkCache.get(cacheKey) || '';
  }
  if (!artworkInFlight.has(cacheKey)) {
    fetchTrackArtwork(title, artist).catch(() => {});
  }
  return '';
}

function startWindowsMediaWatcher() {
  if (process.platform !== 'win32' || mediaWatchChild) return;
  const scriptPath = path.join(__dirname, 'src', 'native', 'media-watch.ps1');
  if (!fs.existsSync(scriptPath)) return;

  try {
    mediaWatchChild = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-Parent',
        String(process.pid)
      ],
      { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'] }
    );

    let buffer = '';
    const stdoutDecoder = new StringDecoder('utf8');
    mediaWatchChild.stdout.on('data', chunk => {
      buffer += stdoutDecoder.write(chunk);
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (line && line.startsWith('{')) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.title) {
              const clean = normalizeTrackMeta(parsed.title, parsed.artist);
              parsed.cleanTitle = clean.title || parsed.title;
              parsed.cleanArtist = clean.artist || parsed.artist || '';
              const cover = getArtworkOrFetchBackground(parsed.title, parsed.artist);
              parsed.image_url = cover || '';
            }
            latestWindowsMedia = parsed;
            if (mascotWindow && !mascotWindow.isDestroyed()) {
              mascotWindow.webContents.send('media:state-changed', latestWindowsMedia);
            }
          } catch {}
        }
      }
    });

    mediaWatchChild.on('exit', () => {
      mediaWatchChild = null;
      if (!app.isQuitting) {
        setTimeout(startWindowsMediaWatcher, 2000);
      }
    });
  } catch (err) {
    console.warn('[LumaDock MediaWatcher]', err.message);
  }
}


// ============================================================
// JSON
// ============================================================

function writeJson(
  filePath,
  data
) {
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      data,
      null,
      2
    ),
    'utf8'
  );
}


function readJson(
  filePath
) {
  try {
    return JSON.parse(
      fs.readFileSync(
        filePath,
        'utf8'
      )
    );

  } catch {
    return null;
  }
}


// ============================================================
// SAFE STORAGE
// ============================================================

function encryptString(
  value
) {
  if (
    !safeStorage.isEncryptionAvailable()
  ) {
    throw new Error(
      i18n.t('spotify.errors.dpapiUnavailable')
    );
  }


  return safeStorage
    .encryptString(
      value
    )
    .toString(
      'base64'
    );
}


function decryptString(
  value
) {
  if (
    !value ||
    !safeStorage.isEncryptionAvailable()
  ) {
    return '';
  }


  try {
    return safeStorage.decryptString(
      Buffer.from(
        value,
        'base64'
      )
    );

  } catch {
    return '';
  }
}


// ============================================================
// LUMADOCK CONNECTION
// ============================================================

function saveConnection(
  deviceToken,
  user
) {
  writeJson(
    CONNECTION_FILE(),
    {
      token:
        encryptString(
          deviceToken
        ),

      user:
        user ||
        null
    }
  );
}


function getConnection() {
  const saved =
    readJson(
      CONNECTION_FILE()
    );


  const token =
    saved?.token
      ?
        decryptString(
          saved.token
        )
      :
        '';


  return {
    connected:
      Boolean(
        token
      ),

    token,

    user:
      saved?.user ||
      null
  };
}


// ============================================================
// HTTP
// ============================================================

async function readResponse(
  response
) {
  const text =
    await response.text();


  if (!text) {
    return null;
  }


  try {
    return JSON.parse(
      text
    );

  } catch {
    return text;
  }
}


async function postJson(
  url,
  body,
  headers = {}
) {
  const response =
    await fetch(
      url,
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',

          ...headers
        },

        body:
          JSON.stringify(
            body ||
            {}
          )
      }
    );


  const data =
    await readResponse(
      response
    );


  if (
    !response.ok
  ) {
    throw new Error(
      data?.message ||
      data?.error ||
      `HTTP ${response.status}`
    );
  }


  return data;
}


// ============================================================
// LUMADOCK PAIR
// ============================================================

async function connectToLumaDock() {
  const existing =
    getConnection();


  if (
    existing.connected
  ) {
    return {
      ok: true,
      connected: true,

      user:
        existing.user
    };
  }


  const startData =
    await postJson(
      `${API_BASE}/pair/start`,
      {
        device_name:
          `LumaDock Assistent - ${os.hostname()}`
      }
    );


  if (
    !startData?.pair_code
  ) {
    throw new Error(
      'Could not start LumaDock pairing.'
    );
  }


  if (
    startData.connect_url
  ) {
    await shell.openExternal(
      startData.connect_url
    );
  }


  const startedAt =
    Date.now();


  const timeout =
    Math.max(
      60000,

      Number(
        startData.expires_in ||
        300
      ) *
      1000
    );


  while (
    Date.now() -
    startedAt <
    timeout
  ) {
    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          1800
        )
    );


    const status =
      await postJson(
        `${API_BASE}/pair/status`,
        {
          pair_code:
            startData.pair_code
        }
      );


    const pairState =
      status?.state ||
      status?.status;


    if (
      pairState ===
        'approved' &&
      status?.device_token
    ) {
      saveConnection(
        status.device_token,
        status.user ||
        null
      );


      return {
        ok: true,
        connected: true,

        user:
          status.user ||
          null
      };
    }


    if (
      pairState ===
      'denied'
    ) {
      throw new Error(
        i18n.t('buddy.errors.pairingDenied')
      );
    }


    if (
      pairState ===
      'expired'
    ) {
      throw new Error(
        i18n.t('buddy.errors.pairingExpired')
      );
    }
  }


  throw new Error(
    i18n.t('buddy.errors.pairingTimeout')
  );
}


// ============================================================
// LUMADOCK STATE
// ============================================================

async function getLumaDockState() {
  const connection =
    getConnection();


  if (
    !connection.connected
  ) {
    return {
      ok: false,
      connected: false
    };
  }


  const response =
    await fetch(
      `${API_BASE}/state`,
      {
        headers: {
          'X-LumaDock-Companion-Key':
            connection.token
        }
      }
    );


  const data =
    await readResponse(
      response
    );


  if (
    !response.ok
  ) {
    return {
      ok: false,
      connected: true,

      error:
        data?.message ||
        data?.error ||
        `HTTP ${response.status}`
    };
  }


  return {
    ...(data || {}),

    ok: true,
    connected: true
  };
}


// ============================================================
// URL
// ============================================================

function normalizeLumaDockUrl(
  value
) {
  try {
    const url =
      value?.startsWith('/')
        ?
          new URL(
            value,
            'https://lumadock.app'
          )
        :
          new URL(
            value
          );


    if (
      url.protocol !==
        'https:' ||
      url.hostname !==
        'lumadock.app'
    ) {
      return '';
    }


    return url.toString();

  } catch {
    return '';
  }
}


function openLumaDockUrl(
  value
) {
  const url =
    normalizeLumaDockUrl(
      value
    );


  if (
    url
  ) {
    shell.openExternal(
      url
    );
  }
}


// ============================================================
// SPOTIFY STORAGE
// ============================================================

function base64Url(
  buffer
) {
  return buffer
    .toString(
      'base64'
    )
    .replace(
      /\+/g,
      '-'
    )
    .replace(
      /\//g,
      '_'
    )
    .replace(
      /=+$/g,
      ''
    );
}


function saveSpotifyTokens(
  tokens
) {
  writeJson(
    SPOTIFY_TOKEN_FILE(),
    {
      encrypted:
        encryptString(
          JSON.stringify(
            tokens
          )
        )
    }
  );
}


function loadSpotifyTokens() {
  const saved =
    readJson(
      SPOTIFY_TOKEN_FILE()
    );


  if (
    !saved?.encrypted
  ) {
    return null;
  }


  const raw =
    decryptString(
      saved.encrypted
    );


  if (!raw) {
    return null;
  }


  try {
    const parsed = JSON.parse(
      raw
    );
    const activeId = getSpotifyClientId();
    if (!parsed || !activeId || parsed.clientId !== activeId) {
      if (activeId) clearSpotifyTokens();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}


function clearSpotifyTokens() {
  try {
    fs.unlinkSync(
      SPOTIFY_TOKEN_FILE()
    );

  } catch {}
}


// ============================================================
// SPOTIFY TOKEN
// ============================================================

async function exchangeSpotifyCode(
  code,
  verifier
) {
  const response =
    await fetch(
      'https://accounts.spotify.com/api/token',
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded'
        },

        body:
          new URLSearchParams({
            client_id:
              getSpotifyClientId(),

            grant_type:
              'authorization_code',

            code,

            redirect_uri:
              SPOTIFY_REDIRECT_URI,

            code_verifier:
              verifier
          })
      }
    );


  const data =
    await readResponse(
      response
    );


  if (
    !response.ok
  ) {
    throw new Error(
      data?.error_description ||
      data?.error ||
      i18n.t('spotify.errors.connectFailed')
    );
  }


  const tokens = {
    access_token:
      data.access_token,

    refresh_token:
      data.refresh_token,

    scope:
      String(data.scope || SPOTIFY_SCOPES),

    clientId:
      getSpotifyClientId(),

    expires_at:
      Date.now() +
      Number(
        data.expires_in ||
        3600
      ) *
      1000
  };


  saveSpotifyTokens(
    tokens
  );
  playlistsCache = null;

  if (mascotWindow && !mascotWindow.isDestroyed()) {
    try {
      mascotWindow.webContents.send('spotify:auth-updated', { connected: true, scope: tokens.scope });
    } catch {}
  }

  return tokens;
}


async function refreshSpotifyToken(
  current
) {
  if (
    !current?.refresh_token
  ) {
    clearSpotifyTokens();


    throw new Error(
      i18n.t('spotify.errors.sessionNeedsRefresh')
    );
  }


  const response =
    await fetch(
      'https://accounts.spotify.com/api/token',
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded'
        },

        body:
          new URLSearchParams({
            client_id:
              getSpotifyClientId(),

            grant_type:
              'refresh_token',

            refresh_token:
              current.refresh_token
          })
      }
    );


  const data =
    await readResponse(
      response
    );


  if (
    !response.ok
  ) {
    if (
      data?.error ===
      'invalid_grant'
    ) {
      clearSpotifyTokens();
    }


    throw new Error(
      data?.error_description ||
      data?.error ||
      i18n.t('spotify.errors.refreshFailed')
    );
  }


  const next = {
    ...current,

    access_token:
      data.access_token,

    refresh_token:
      data.refresh_token ||
      current.refresh_token,

    scope:
      data.scope ||
      current.scope ||
      SPOTIFY_SCOPES,

    clientId:
      getSpotifyClientId(),

    expires_at:
      Date.now() +
      Number(
        data.expires_in ||
        3600
      ) *
      1000
  };


  saveSpotifyTokens(
    next
  );


  return next;
}


async function spotifyToken(
  forceRefresh =
    false
) {
  let current =
    loadSpotifyTokens();


  if (!current) {
    return null;
  }


  if (
    forceRefresh ||
    !current.access_token ||
    Date.now() >=
      Number(
        current.expires_at ||
        0
      ) -
      60000
  ) {
    if (
      !spotifyRefreshPromise
    ) {
      spotifyRefreshPromise =
        refreshSpotifyToken(
          current
        );
    }


    try {
      current =
        await spotifyRefreshPromise;

    } finally {
      spotifyRefreshPromise =
        null;
    }
  }


  return (
    current?.access_token ||
    null
  );
}


// ============================================================
// SPOTIFY CONNECT
// ============================================================

async function spotifyConnect(options = {}) {
  const clientId = getSpotifyClientId();
  if (!isValidSpotifyClientId(clientId)) {
    throw new Error(i18n.t('spotify.errors.setClientIdFirst'));
  }
  const existing = loadSpotifyTokens();
  const force = Boolean(options?.force) || (Boolean(existing?.refresh_token) && !hasSpotifyPlaylistScope(existing));
  if (
    !force &&
    existing?.refresh_token
  ) {
    return {
      ok: true,
      connected: true,
      scope: existing.scope || ''
    };
  }


  if (
    spotifyAuthPromise
  ) {
    return spotifyAuthPromise;
  }


  spotifyAuthPromise =
    new Promise(
      (
        resolve,
        reject
      ) => {
        const verifier =
          base64Url(
            crypto.randomBytes(
              64
            )
          );


        const challenge =
          base64Url(
            crypto
              .createHash(
                'sha256'
              )
              .update(
                verifier
              )
              .digest()
          );


        const state =
          base64Url(
            crypto.randomBytes(
              24
            )
          );


        let finished =
          false;


        const finish = (
          fn,
          value
        ) => {
          if (
            finished
          ) {
            return;
          }


          finished =
            true;


          clearTimeout(
            timeout
          );


          try {
            server.close();
          } catch {}


          fn(
            value
          );
        };


        const server =
          http.createServer(
            async (
              req,
              res
            ) => {
              try {
                const url =
                  new URL(
                    req.url,
                    SPOTIFY_REDIRECT_URI
                  );


                if (url.pathname === '/favicon.ico') {
                  res.writeHead(204);
                  res.end();
                  return;
                }

                if (
                  url.pathname !== '/callback' &&
                  url.pathname !== '/callback/'
                ) {
                  res.writeHead(
                    404
                  );

                  res.end();

                  return;
                }


                if (
                  url.searchParams.get(
                    'state'
                  ) !==
                    state
                ) {
                  throw new Error(
                    i18n.t('spotify.errors.invalidCallback')
                  );
                }


                const oauthError =
                  url.searchParams.get(
                    'error'
                  );


                if (
                  oauthError
                ) {
                  throw new Error(
                    i18n.t('spotify.errors.authCancelled')
                  );
                }


                const code =
                  url.searchParams.get(
                    'code'
                  );


                if (!code) {
                  throw new Error(
                    i18n.t('spotify.errors.noAuthCode')
                  );
                }


                await exchangeSpotifyCode(
                  code,
                  verifier
                );


                res.writeHead(
                  200,
                  {
                    'Content-Type':
                      'text/html; charset=utf-8'
                  }
                );


                res.end(renderSpotifyCallbackHtml(true));


                finish(
                  resolve,
                  {
                    ok: true,
                    connected: true
                  }
                );

              } catch (error) {
                try {
                  res.writeHead(
                    400,
                    {
                      'Content-Type':
                        'text/html; charset=utf-8'
                    }
                  );


                  res.end(renderSpotifyCallbackHtml(false, error?.message));

                } catch {}


                finish(
                  reject,
                  error
                );
              }
            }
          );


        const timeout =
          setTimeout(
            () => {
              finish(
                reject,

                new Error(
                  i18n.t('spotify.errors.authTimedOut')
                )
              );
            },

            180000
          );


        server.on(
          'error',

          error => {
            finish(
              reject,
              error
            );
          }
        );


        server.listen(
          8888,
          '127.0.0.1',

          async () => {
            const url =
              new URL(
                'https://accounts.spotify.com/authorize'
              );


            url.search =
              new URLSearchParams({
                client_id:
                  getSpotifyClientId(),

                response_type:
                  'code',

                redirect_uri:
                  SPOTIFY_REDIRECT_URI,

                scope:
                  SPOTIFY_SCOPES,

                code_challenge_method:
                  'S256',

                code_challenge:
                  challenge,

                state,

                ...(force ? { show_dialog: 'true' } : {})
              }).toString();


            try {
              await shell.openExternal(
                url.toString()
              );

            } catch (error) {
              finish(
                reject,
                error
              );
            }
          }
        );
      }
    );


  try {
    return await spotifyAuthPromise;

  } finally {
    spotifyAuthPromise =
      null;
  }
}


// ============================================================
// SPOTIFY API
// ============================================================

async function spotifyApi(
  route,
  options = {},
  retried = false
) {
  if (
    Date.now() <
    spotifyRateLimitedUntil
  ) {
    throw new Error(
      i18n.t('spotify.errors.rateLimited')
    );
  }


  const token =
    await spotifyToken(
      retried
    );


  if (!token) {
    throw new Error(
      i18n.t('spotify.errors.notConnected')
    );
  }


  const response =
    await fetch(
      `https://api.spotify.com${route}`,
      {
        ...options,

        signal: options.signal || AbortSignal.timeout(1800),

        headers: {
          Authorization:
            `Bearer ${token}`,

          ...(
            options.headers ||
            {}
          )
        }
      }
    );


  if (
    response.status ===
      401 &&
    !retried
  ) {
    await spotifyToken(
      true
    );


    return spotifyApi(
      route,
      options,
      true
    );
  }


  if (
    response.status ===
    429
  ) {
    const seconds =
      Number(
        response.headers.get(
          'retry-after'
        ) ||
        2
      );


    spotifyRateLimitedUntil =
      Date.now() +
      seconds *
      1000;


    throw new Error(
      i18n.t('spotify.errors.rateLimited')
    );
  }


  if (
    response.status ===
    204
  ) {
    return null;
  }


  const data =
    await readResponse(
      response
    );


  if (
    !response.ok
  ) {
    const plainErr = typeof data === 'string' ? data.trim().slice(0, 140) : '';
    const err = new Error(
      data?.error?.message ||
      plainErr ||
      `Spotify HTTP ${response.status}`
    );
    err.status = response.status;
    throw err;
  }


  return data;
}


// ============================================================
// SPOTIFY STATE
// ============================================================

async function getSpotifyState() {
  const localMedia = (latestWindowsMedia && latestWindowsMedia.active && latestWindowsMedia.title) ? latestWindowsMedia : null;

  // 1. Instant local Windows GSMTC session (0ms latency, zero rate limits, no hangs)
  if (localMedia) {
    const clean = normalizeTrackMeta(localMedia.title, localMedia.artist);
    const cover = getArtworkOrFetchBackground(localMedia.title, localMedia.artist);
    return {
      ok: true,
      connected: true,
      active: true,
      is_playing: Boolean(localMedia.is_playing),
      progress_ms: Number(localMedia.position || 0),
      duration_ms: Number(localMedia.duration || 0),
      track: {
        id: 'local-' + Buffer.from(localMedia.title).toString('hex').slice(0, 12),
        uri: '',
        name: clean.title || localMedia.title,
        artist: clean.artist || localMedia.artist || i18n.t('spotify.fallbackArtist'),
        image_url: cover || '',
        source: localMedia.source || 'Spotify'
      },
      device: {
        id: 'local',
        name: os.hostname(),
        type: 'Computer',
        active: true,
        volume: null,
        here: true
      }
    };
  }

  const hasTokens = Boolean(loadSpotifyTokens());
  if (!hasTokens) {
    return {
      ok: true,
      connected: false,
      active: false
    };
  }

  try {
    let data = null;
    try {
      data = await spotifyApi('/v1/me/player?additional_types=track,episode');
    } catch {}

    // Fallback: if /v1/me/player returns 204 or no item, try /v1/me/player/currently-playing
    if (!data || !data.item) {
      try {
        const cp = await spotifyApi('/v1/me/player/currently-playing?additional_types=track,episode');
        if (cp && cp.item) {
          data = cp;
        }
      } catch {}
    }

    // Fallback to local Windows media session if Spotify Web API has no track
    if ((!data || !data.item) && localMedia) {
      const cover = getArtworkOrFetchBackground(localMedia.title, localMedia.artist);
      return {
        ok: true,
        connected: true,
        active: true,
        is_playing: Boolean(localMedia.is_playing),
        progress_ms: Number(localMedia.position || 0),
        duration_ms: Number(localMedia.duration || 0),
        track: {
          id: 'local-' + Buffer.from(localMedia.title).toString('hex').slice(0, 12),
          uri: '',
          name: localMedia.title,
          artist: localMedia.artist || 'Spotify',
          image_url: cover || ''
        },
        device: {
          id: 'local',
          name: os.hostname(),
          type: 'Computer',
          active: true,
          volume: null,
          here: true
        }
      };
    }

    if (!data || !data.item) {
      return {
        ok: true,
        connected: true,
        active: false,
        is_playing: false,
        progress_ms: 0,
        duration_ms: 0,
        track: null
      };
    }

    const item = data.item;
    const images = item.album?.images || item.images || item.show?.images || [];

    return {
      ok: true,
      connected: true,
      active: true,
      is_playing: Boolean(data.is_playing),
      progress_ms: Number(data.progress_ms || 0),
      duration_ms: Number(item.duration_ms || 0),
      track: {
        id: item.id || '',
        uri: item.uri || '',
        name: item.name || 'Spotify',
        artist: item.artists?.map(a => a.name).join(', ') || item.show?.name || '',
        image_url: images?.[0]?.url || ''
      },
      device: spotifyDevice(data.device)
    };
  } catch (error) {
    if (localMedia) {
      const cover = getArtworkOrFetchBackground(localMedia.title, localMedia.artist);
      return {
        ok: true,
        connected: true,
        active: true,
        is_playing: Boolean(localMedia.is_playing),
        progress_ms: Number(localMedia.position || 0),
        duration_ms: Number(localMedia.duration || 0),
        track: {
          id: 'local-' + Buffer.from(localMedia.title).toString('hex').slice(0, 12),
          uri: '',
          name: localMedia.title,
          artist: localMedia.artist || 'Spotify',
          image_url: cover || ''
        },
        device: {
          id: 'local',
          name: os.hostname(),
          type: 'Computer',
          active: true,
          volume: null,
          here: true
        }
      };
    }
    return {
      ok: false,
      connected: true,
      active: false,
      error: error.message
    };
  }
}

// One Spotify Connect device, and whether it is this PC (the Spotify app here, or a web player here).
function spotifyDevice(device) {
  if (!device) return null;
  const name = String(device.name || ''), type = String(device.type || '');
  const here = type === 'Computer' && (name.toLowerCase() === os.hostname().toLowerCase() || /^web player/i.test(name));
  return { id: String(device.id || ''), name, type, active: Boolean(device.is_active), volume: Number.isFinite(device.volume_percent) ? device.volume_percent : null, here };
}

// Spotify Connect: your devices, and moving the music to another one (like the speaker button in Spotify).
async function spotifyDevices() {
  const localDev = {
    id: 'local',
    name: os.hostname(),
    type: 'Computer',
    active: true,
    volume: 100,
    here: true
  };
  try {
    const data = await spotifyApi('/v1/me/player/devices');
    const devs = (data?.devices || []).filter(d => d.id && !d.is_restricted).map(spotifyDevice);
    if (!devs.some(d => d.here)) {
      devs.unshift(localDev);
    }
    return { ok: true, devices: devs };
  } catch (error) {
    return {
      ok: true,
      devices: [localDev],
      error: /403|premium/i.test(error.message)
        ? i18n.t('spotify.premiumRequiredDevices')
        : error.message
    };
  }
}

async function spotifyTransfer(id) {
  if (id === 'local') return { ok: true };
  if (typeof id !== 'string' || !/^[\w-]{6,80}$/.test(id)) return { ok: false, error: i18n.t('status.unknown') };
  try {
    await spotifyApi('/v1/me/player', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_ids: [id], play: true }) });
    return { ok: true };
  } catch (error) {
    const isPremium = /premium|403/i.test(error.message);
    return { ok: false, error: isPremium ? i18n.t('spotify.premiumRequiredTransfer') : error.message };
  }
}


// ============================================================
// SPOTIFY CONTROL
// ============================================================

async function spotifyControl(action) {
  if (action === 'open') {
    try {
      await shell.openExternal('spotify:');
    } catch {
      await shell.openExternal('https://open.spotify.com/');
    }
    return { ok: true };
  }

  if (latestWindowsMedia) {
    if (action === 'play') latestWindowsMedia.is_playing = true;
    else if (action === 'pause') latestWindowsMedia.is_playing = false;
  }

  // 1. Instant local Windows session control via command file
  sendMediaCommand(action);

  // 2. Background sync to Spotify Web API
  const commands = {
    play: ['/v1/me/player/play', 'PUT'],
    pause: ['/v1/me/player/pause', 'PUT'],
    next: ['/v1/me/player/next', 'POST'],
    previous: ['/v1/me/player/previous', 'POST']
  };

  const command = commands[action];
  if (command) {
    spotifyApi(command[0], { method: command[1] }).catch(() => {});
  }

  return { ok: true };
}

async function spotifySeek(positionMs) {
  const safePosition = Math.max(0, Math.round(Number(positionMs) || 0));
  if (latestWindowsMedia) {
    latestWindowsMedia.position = safePosition;
  }
  // 1. Instant local Windows session seek
  sendMediaCommand('seek ' + safePosition);
  // 2. Background sync to Spotify Web API
  spotifyApi(`/v1/me/player/seek?position_ms=${safePosition}`, { method: 'PUT' }).catch(() => {});
  return { ok: true };
}

// ============================================================
// SPOTIFY PLAYLISTS (Cover-Only Browser & Player)
// ============================================================

let playlistsCache = null;

const SPOTIFY_CUSTOM_PLAYLISTS_FILE = () =>
  path.join(app.getPath('userData'), 'spotify-custom-playlists.json');

function loadCustomPlaylists() {
  const saved = readJson(SPOTIFY_CUSTOM_PLAYLISTS_FILE());
  return Array.isArray(saved) ? saved.filter(p => p && p.id && p.uri && p.image_url) : [];
}

function saveCustomPlaylists(list) {
  try {
    writeJson(SPOTIFY_CUSTOM_PLAYLISTS_FILE(), Array.isArray(list) ? list.slice(0, 32) : []);
  } catch {}
}

function mergePlaylists(customList, apiList = []) {
  const seen = new Set();
  const out = [];
  for (const item of [...customList, ...apiList]) {
    if (!item?.uri || seen.has(item.uri)) continue;
    seen.add(item.uri);
    out.push(item);
  }
  return out;
}

async function addCustomSpotifyPlaylist(payload = {}) {
  const rawInput = payload?.fromClipboard ? clipboard.readText() : payload?.url;
  const parsed = parseSpotifyPlaylistInput(rawInput);
  if (!parsed) {
    return {
      ok: false,
      error: payload?.fromClipboard
        ? i18n.t('spotify.errors.invalidPlaylistClip')
        : i18n.t('spotify.errors.invalidPlaylistUrl')
    };
  }
  try {
    const oembedRes = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(parsed.url)}`,
      { signal: AbortSignal.timeout(4500), headers: { 'User-Agent': 'LumaDock/1.2.0' } }
    );
    if (!oembedRes.ok) {
      return { ok: false, error: i18n.t('spotify.errors.oembedHttpError', { status: oembedRes.status }) };
    }
    const meta = await oembedRes.json();
    const imageUrl = String(meta?.thumbnail_url || '').trim();
    if (!imageUrl) {
      return { ok: false, error: i18n.t('spotify.errors.noPlaylistCoverFound') };
    }
    const item = {
      id: parsed.id,
      name: String(meta?.title || 'Spotify Playlist').trim(),
      uri: parsed.uri,
      image_url: imageUrl,
      external_url: parsed.url,
      tracks_total: 0,
      custom: true
    };
    const next = [item, ...loadCustomPlaylists().filter(p => p.id !== parsed.id)];
    saveCustomPlaylists(next);
    playlistsCache = null;
    return { ok: true, playlist: item, customPlaylists: next };
  } catch (err) {
    return { ok: false, error: err?.message || i18n.t('spotify.errors.coverLoadFailed') };
  }
}

function removeCustomSpotifyPlaylist(id) {
  const cleanId = String(id || '').trim();
  const next = loadCustomPlaylists().filter(p => p.id !== cleanId);
  saveCustomPlaylists(next);
  playlistsCache = null;
  return { ok: true, customPlaylists: next };
}

async function spotifyPlaylists(force = false) {
  const custom = loadCustomPlaylists();
  const tokens = loadSpotifyTokens();
  if (!tokens?.access_token && !tokens?.refresh_token) {
    if (custom.length) {
      return { ok: true, playlists: custom, customOnly: true };
    }
    return { ok: false, needsAuth: true, playlists: [] };
  }
  if (!hasSpotifyPlaylistScope(tokens)) {
    if (custom.length) {
      return { ok: true, playlists: custom, partialError: i18n.t('spotify.errors.missingPlaylistScope') };
    }
    return { ok: false, needsReauth: true, playlists: [], error: i18n.t('spotify.errors.missingPlaylistScopeReauth') };
  }
  if (!force && playlistsCache && Date.now() - playlistsCache.at < 60000) {
    return { ok: true, playlists: mergePlaylists(custom, playlistsCache.items) };
  }
  try {
    const items = await collectPagedSpotifyPlaylists(
      route => spotifyApi(route, { signal: AbortSignal.timeout(5000) }),
      { pageLimit: 50, maxPlaylists: 250 }
    );
    playlistsCache = { at: Date.now(), items };
    return { ok: true, playlists: mergePlaylists(custom, items) };
  } catch (error) {
    const classified = classifySpotifyPlaylistsError(error, playlistsCache?.items || []);
    if (custom.length) {
      return { ok: true, playlists: mergePlaylists(custom, playlistsCache?.items || []), partialError: classified.error };
    }
    return classified;
  }
}

const playlistTracksCache = new Map();

async function spotifyPlaylistTracks(playlistId, force = false) {
  const id = String(typeof playlistId === 'object' ? playlistId?.id : playlistId || '').trim();
  const bypassCache = Boolean(force || (typeof playlistId === 'object' && playlistId?.force));
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) {
    return { ok: false, tracks: [], total: 0, error: i18n.t('spotify.errors.invalidPlaylistId') };
  }
  const cached = playlistTracksCache.get(id);
  if (!bypassCache && cached && Date.now() - cached.at < 60000) {
    return {
      ok: true,
      tracks: cached.items,
      total: cached.total || cached.items.length,
      partial: Boolean(cached.partial),
      truncated: Boolean(cached.truncated)
    };
  }
  try {
    const result = await collectPagedSpotifyTracks(
      route => spotifyApi(route, { signal: AbortSignal.timeout(6000) }),
      id,
      { pageLimit: 100, maxTracks: 2000 }
    );
    playlistTracksCache.set(id, {
      at: Date.now(),
      items: result.tracks,
      total: result.total,
      partial: result.partial,
      truncated: result.truncated
    });
    return {
      ok: true,
      tracks: result.tracks,
      total: result.total,
      partial: result.partial,
      truncated: result.truncated
    };
  } catch (error) {
    return {
      ok: false,
      tracks: cached?.items || [],
      total: cached?.total || cached?.items?.length || 0,
      error: error?.message || i18n.t('spotify.errors.tracksFetchFailed')
    };
  }
}

async function spotifyPlayPlaylist(payload) {
  const uri = String(payload?.uri || '').trim();
  const extUrl = String(payload?.url || '').trim();
  const offsetUri = String(payload?.offsetUri || '').trim();
  const validOffset = /^spotify:(?:track|episode):[A-Za-z0-9]+$/.test(offsetUri) ? offsetUri : '';
  if (!/^spotify:playlist:[A-Za-z0-9]+$/.test(uri)) {
    return { ok: false, error: i18n.t('spotify.errors.invalidPlaylistUri') };
  }
  try {
    const body = validOffset
      ? { context_uri: uri, offset: { uri: validOffset } }
      : { context_uri: uri };
    await spotifyApi('/v1/me/player/play', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { ok: true, method: 'api' };
  } catch (error) {
    // Open in desktop Spotify app when Spotify Free or no remote active device is available.
    try {
      await shell.openExternal(validOffset || uri);
      return { ok: true, method: 'uri', fallback: true, note: error?.message };
    } catch {
      if (/^https:\/\/open\.spotify\.com\/playlist\//.test(extUrl)) {
        await shell.openExternal(extUrl).catch(() => {});
        return { ok: true, method: 'web', fallback: true };
      }
      return { ok: false, error: error?.message || i18n.t('spotify.errors.playlistOpenFailed') };
    }
  }
}

// ============================================================
// SPOTIFY LYRICS (LRCLIB Time-synced Lyrics + Disk Cache)
// ============================================================

const LYRICS_CACHE_FILE = () => path.join(app.getPath('userData'), 'lyrics-cache.json');
const lyricsCache = new Map();
const lyricsMissCache = new Map();
const lyricsInFlight = new Map();
let lyricsDiskLoaded = false;

function loadLyricsDiskCache() {
  if (lyricsDiskLoaded) return;
  lyricsDiskLoaded = true;
  const saved = readJson(LYRICS_CACHE_FILE());
  if (saved && typeof saved === 'object') {
    for (const [k, v] of Object.entries(saved)) {
      if (v && v.ok && Array.isArray(v.lines)) lyricsCache.set(k, v);
    }
  }
}

function saveLyricsDiskCache() {
  try {
    const entries = [...lyricsCache.entries()].filter(([, v]) => v?.ok).slice(-200);
    writeJson(LYRICS_CACHE_FILE(), Object.fromEntries(entries));
  } catch {}
}

async function queryLrcLib(queries, durationMs) {
  let fallbackPlain = null;
  const durSec = durationMs ? Math.round(durationMs / 1000) : 0;
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    try {
      const params = new URLSearchParams({ track_name: q.title, artist_name: q.artist || '' });
      if (durSec && i === 0) params.append('duration', String(durSec));
      const res = await fetch(`https://lrclib.net/api/get?${params}`, {
        headers: { 'User-Agent': 'LumaDock/1.2.0 (https://github.com/WhoIsMrSentry/LumaDock)' },
        signal: AbortSignal.timeout(5500)
      });
      if (res.ok) {
        const direct = await res.json();
        if (direct?.syncedLyrics) return direct;
        if (direct?.plainLyrics && !fallbackPlain) fallbackPlain = direct;
      }
    } catch {}

    try {
      const qStr = encodeURIComponent(`${q.title} ${q.artist || ''}`.trim());
      const res = await fetch(`https://lrclib.net/api/search?q=${qStr}`, {
        headers: { 'User-Agent': 'LumaDock/1.2.0 (https://github.com/WhoIsMrSentry/LumaDock)' },
        signal: AbortSignal.timeout(5500)
      });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length) {
          const synced = list.find(x => x?.syncedLyrics);
          if (synced) return synced;
          if (!fallbackPlain) fallbackPlain = list.find(x => x?.plainLyrics) || null;
        }
      }
    } catch {}
  }
  return fallbackPlain;
}

async function fetchLyrics(title, artist, durationMs) {
  if (!title) return { ok: false, error: 'No track title' };
  loadLyricsDiskCache();
  const queries = buildLyricsQueries(title, artist);
  if (!queries.length) return { ok: false, error: 'No track title' };
  const cacheKey = `${queries[0].title}:::${queries[0].artist}`.toLowerCase();

  const hit = lyricsCache.get(cacheKey);
  if (hit?.ok) return hit;

  const missAt = lyricsMissCache.get(cacheKey);
  if (missAt && Date.now() - missAt < 15000) {
    return { ok: false, error: 'Lyrics not found' };
  }
  if (lyricsInFlight.has(cacheKey)) {
    return lyricsInFlight.get(cacheKey);
  }

  const task = (async () => {
    const lrcData = await queryLrcLib(queries, durationMs);
    if (!lrcData || (!lrcData.syncedLyrics && !lrcData.plainLyrics)) {
      lyricsMissCache.set(cacheKey, Date.now());
      return { ok: false, error: 'Lyrics not found' };
    }
    const lines = parseLrcLines(lrcData.syncedLyrics);
    const result = {
      ok: true,
      synced: lines.length > 0,
      lines,
      plain: lrcData.plainLyrics || ''
    };
    lyricsMissCache.delete(cacheKey);
    lyricsCache.set(cacheKey, result);
    saveLyricsDiskCache();
    return result;
  })().finally(() => {
    lyricsInFlight.delete(cacheKey);
  });

  lyricsInFlight.set(cacheKey, task);
  return task;
}


// ============================================================
// WINDOW POSITION, DISPLAY & FULLSCREEN AUTO-HIDE
// ============================================================

const WINDOW_PREFS_FILE = () => path.join(app.getPath('userData'), 'window-prefs.json');
let windowPrefs = { fullscreenHide: false, displayIndex: -1 };
let lastFullscreenActive = false;

function loadWindowPrefs() {
  const saved = readJson(WINDOW_PREFS_FILE());
  if (saved && typeof saved === 'object') {
    windowPrefs = {
      fullscreenHide: Boolean(saved.fullscreenHide),
      displayIndex: Number.isInteger(saved.displayIndex) ? saved.displayIndex : -1
    };
  }
}

function getTargetDisplay() {
  const all = screen.getAllDisplays();
  if (windowPrefs.displayIndex >= 0 && all[windowPrefs.displayIndex]) {
    return all[windowPrefs.displayIndex];
  }
  return screen.getPrimaryDisplay();
}

function positionMascot() {
  if (
    !mascotWindow ||
    mascotWindow.isDestroyed()
  ) {
    return;
  }


  const display = getTargetDisplay();


  const x =
    Math.round(
      display.bounds.x +
      (
        display.bounds.width -
        PANEL_WIDTH
      ) /
      2
    );


  const y =
    display.bounds.y;


  mascotWindow.setPosition(
    x,
    y,
    false
  );
}

app.on('lumadock-fullscreen', active => {
  lastFullscreenActive = Boolean(active);
  if (!mascotWindow || mascotWindow.isDestroyed()) return;
  if (windowPrefs.fullscreenHide && lastFullscreenActive) {
    if (mascotWindow.isVisible()) mascotWindow.hide();
  } else if (!mascotWindow.isVisible() && !app.isQuitting) {
    mascotWindow.showInactive();
  }
});


// ============================================================
// POINTER
// ============================================================

// Safety net: the island repeats its choice at least once a second. If it goes quiet while the window
// still catches the mouse (a frozen or throttled page), let go after 2 s, so clicks reach the apps below.
let interactiveHeardAt = 0;

let lastPointerKey = '';
let lastPointerAt = 0;

function sendPointer() {
  if (
    !mascotWindow ||
    mascotWindow.isDestroyed() ||
    !mascotWindow.isVisible()
  ) {
    return;
  }


  if (
    mascotInteractive &&
    Date.now() - interactiveHeardAt > 2000
  ) {
    setMascotInteractive(
      false
    );
  }


  const cursor =
    screen.getCursorScreenPoint();


  const bounds =
    mascotWindow.getBounds();


  // Only tell the island when the mouse moved (or the island moved): this runs 50 times a second,
  // and sending the same point over and over kept the PC busy for nothing. A refresh every second stays.
  const key = cursor.x + ',' + cursor.y + ',' + bounds.x + ',' + bounds.y;
  const stamp = Date.now();

  if (key === lastPointerKey && stamp - lastPointerAt < 1000) {
    return;
  }

  lastPointerKey = key;
  lastPointerAt = stamp;


  mascotWindow.webContents.send(
    'companion:pointer',
    {
      x:
        cursor.x -
        bounds.x,

      y:
        cursor.y -
        bounds.y,

      insideWindow:
        cursor.x >=
          bounds.x &&
        cursor.x <
          bounds.x +
          bounds.width &&
        cursor.y >=
          bounds.y &&
        cursor.y <
          bounds.y +
          bounds.height
    }
  );
}


// ============================================================
// INTERACTION
// ============================================================

function setMascotInteractive(
  interactive
) {
  if (
    !mascotWindow ||
    mascotWindow.isDestroyed()
  ) {
    return;
  }


  const next =
    Boolean(
      interactive
    );


  if (
    next ===
    mascotInteractive
  ) {
    return;
  }


  mascotInteractive =
    next;


  mascotWindow.setIgnoreMouseEvents(
    !next,
    {
      forward:
        true
    }
  );
}


// ============================================================
// CREATE WINDOW
// ============================================================

function createMascot() {
  mascotWindow =
    new BrowserWindow({
      icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon-512.png'), // Robo under the island (Alt+Tab, Task Manager)
      width:
        PANEL_WIDTH,

      height:
        PANEL_HEIGHT,

      frame:
        false,

      transparent:
        true,

      backgroundColor:
        '#00000000',

      resizable:
        false,

      movable:
        false,

      minimizable:
        false,

      maximizable:
        false,

      fullscreenable:
        false,

      skipTaskbar:
        true,

      alwaysOnTop:
        true,

      // required so text inputs in Project Mode can receive focus
      focusable:
        true,

      hasShadow:
        false,

      show:
        false,

      webPreferences: {
        preload:
          path.join(
            __dirname,
            'preload.js'
          ),

        contextIsolation:
          true,

        nodeIntegration:
          false,

        autoplayPolicy:
          'no-user-gesture-required'
      }
    });


  mascotWindow.setAlwaysOnTop(
    true,
    process.platform === 'darwin' ? 'screen-saver' : 'floating'
  );


  mascotWindow.setVisibleOnAllWorkspaces(
    true,
    {
      visibleOnFullScreen:
        true
    }
  );


  setMascotInteractive(
    false
  );


  positionMascot();


  mascotWindow.loadFile(
    'mascot.html'
  );


  // Always normal size: Chromium remembers a zoom level per page, and a zoomed island looks broken.
  // (Ctrl + scroll or Ctrl + plus can't zoom it either.)
  mascotWindow.webContents.on(
    'did-finish-load',
    () => {
      mascotWindow.webContents.setZoomFactor(1);
      mascotWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    }
  );


  mascotWindow.webContents.on(
    'zoom-changed',
    () => mascotWindow.webContents.setZoomFactor(1)
  );


  mascotWindow.once(
    'ready-to-show',

    () => {
      mascotWindow.showInactive();
    }
  );


  mascotWindow.on(
    'closed',

    () => {
      mascotWindow =
        null;
    }
  );
}


// ============================================================
// LUMADOCK IPC
// ============================================================

ipcMain.handle(
  'lumadock:connect',

  async () =>
    connectToLumaDock()
);


ipcMain.handle(
  'lumadock:get-connection',

  async () => {
    const connection =
      getConnection();


    return {
      connected:
        connection.connected,

      user:
        connection.user
    };
  }
);


ipcMain.handle(
  'lumadock:get-state',

  async () =>
    getLumaDockState()
);


// ============================================================
// PROJECT IPC
// ============================================================

ipcMain.handle(
  'project:get',

  async () =>
    getCurrentProject()
);


ipcMain.handle(
  'project:choose',

  async () =>
    chooseProject()
);


ipcMain.handle(
  'project:rescan',

  async () =>
    getCurrentProject()
);


ipcMain.handle(
  'project:search',

  async (
    _event,
    payload
  ) =>
    searchProject(
      payload?.query ||
      ''
    )
);


ipcMain.handle(
  'project:read',

  async (
    _event,
    payload
  ) =>
    readProjectFile(
      payload?.file ||
      '',

      payload?.line ||
      1
    )
);


// ============================================================
// SPOTIFY IPC
// ============================================================

ipcMain.handle(
  'spotify:connect',

  async (_event, options) =>
    spotifyConnect(options)
);


ipcMain.handle(
  'spotify:get-state',

  async () =>
    getSpotifyState()
);


ipcMain.handle(
  'spotify:control',

  async (
    _event,
    action
  ) =>
    spotifyControl(
      action
    )
);


ipcMain.handle('spotify:devices', () => spotifyDevices()); // Spotify Connect: where it can play
ipcMain.handle('spotify:transfer', (_event, id) => spotifyTransfer(id));
ipcMain.handle('spotify:lyrics', (_event, q) => fetchLyrics(q?.title, q?.artist, q?.duration));
ipcMain.handle('spotify:playlists', (_event, force) => spotifyPlaylists(Boolean(force)));
ipcMain.handle('spotify:playlist-tracks', (_event, id, force) => spotifyPlaylistTracks(id, Boolean(force)));
ipcMain.handle('spotify:play-playlist', (_event, payload) => spotifyPlayPlaylist(payload));
ipcMain.handle('spotify:add-playlist-url', (_event, payload) => addCustomSpotifyPlaylist(payload));
ipcMain.handle('spotify:remove-custom-playlist', (_event, id) => removeCustomSpotifyPlaylist(id));
ipcMain.handle('spotify:get-config', () => {
  const tokens = loadSpotifyTokens();
  const activeId = getSpotifyClientId();
  return {
    clientId: activeId,
    hasClientId: isValidSpotifyClientId(activeId),
    isCustom: isCustomSpotifyClientId(),
    connected: Boolean(tokens?.refresh_token),
    scope: tokens?.scope || '',
    hasPlaylistScope: Boolean(tokens?.refresh_token && hasSpotifyPlaylistScope(tokens)),
    customPlaylists: loadCustomPlaylists()
  };
});
ipcMain.handle('spotify:set-client-id', (_event, clientId) => setSpotifyClientId(clientId));
ipcMain.handle('island:displays', () => {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    index: i,
    id: d.id,
    primary: d.id === primary,
    width: d.bounds.width,
    height: d.bounds.height,
    label: (d.label || `Display ${i + 1}`) + ` (${d.bounds.width}×${d.bounds.height})`
  }));
});
ipcMain.on('island:window-prefs', (_event, prefs) => {
  if (!prefs || typeof prefs !== 'object') return;
  windowPrefs = {
    fullscreenHide: Boolean(prefs.fullscreenHide),
    displayIndex: Number.isInteger(prefs.displayIndex) ? prefs.displayIndex : -1
  };
  try { writeJson(WINDOW_PREFS_FILE(), windowPrefs); } catch {}
  positionMascot();
  if (!windowPrefs.fullscreenHide && mascotWindow && !mascotWindow.isDestroyed() && !mascotWindow.isVisible() && !app.isQuitting) {
    mascotWindow.showInactive();
  }
});
ipcMain.handle('lumadock:open-external', async (_event, url) => {
  const s = String(url || '').trim();
  if (!/^https:\/\//i.test(s)) return { ok: false };
  await shell.openExternal(s);
  return { ok: true };
});

ipcMain.handle(
  'spotify:seek',

  async (
    _event,
    positionMs
  ) =>
    spotifySeek(
      positionMs
    )
);


ipcMain.handle(
  'spotify:disconnect',

  async () => {
    clearSpotifyTokens();
    playlistsCache = null;

    return {
      ok: true
    };
  }
);


// ============================================================
// OTHER IPC
// ============================================================

ipcMain.on(
  'lumadock:open-url',

  (
    _event,
    value
  ) => {
    openLumaDockUrl(
      value
    );
  }
);


ipcMain.on(
  'island:set-interactive',

  (
    _event,
    interactive
  ) => {
    interactiveHeardAt = Date.now();

    setMascotInteractive(
      interactive
    );
  }
);


ipcMain.on(
  'window:close',

  () => {
    app.quit();
  }
);


// Goodbye: before closing, LumaDock plays the farewell animation and the island
// closes smoothly (lumadock-fun.js), then the app exits.
let goodbyeShown = false;

app.on(
  'before-quit',

  event => {
    app.isQuitting = true;
    if (
      goodbyeShown ||
      !mascotWindow ||
      mascotWindow.isDestroyed() ||
      !mascotWindow.isVisible()
    ) {
      return;
    }

    goodbyeShown = true;
    event.preventDefault();
    mascotWindow.webContents.send('lumadock:goodbye');
    setTimeout(() => app.quit(), 1700); // after the goodbye (lumadock-fun.js)
  }
);


ipcMain.on(
  'lumadock:notify',
  () => {}
);


ipcMain.on(
  'island:set-state',
  () => {}
);


ipcMain.on(
  'window:set-mode',
  () => {}
);


// ============================================================
// APP
// ============================================================

app.whenReady().then(
  () => {
    i18n.initI18n({ userData: app.getPath('userData') });
    i18n.registerI18nIpc(ipcMain, { BrowserWindow });
    loadWindowPrefs();
    createMascot();
    startWindowsMediaWatcher();


    pointerTimer =
      setInterval(
        sendPointer,
        20
      );


    screen.on(
      'display-metrics-changed',
      positionMascot
    );


    screen.on(
      'display-added',
      positionMascot
    );


    screen.on(
      'display-removed',
      positionMascot
    );
  }
);


app.on(
  'activate',

  () => {
    if (
      !mascotWindow
    ) {
      createMascot();
    }
  }
);


app.on(
  'before-quit',

  () => {
    if (
      pointerTimer
    ) {
      clearInterval(
        pointerTimer
      );


      pointerTimer =
        null;
    }
  }
);


app.on(
  'window-all-closed',

  () => {
    if (
      process.platform !==
      'darwin'
    ) {
      app.quit();
    }
  }
);
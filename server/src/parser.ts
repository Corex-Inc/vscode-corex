import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import { db, MetaItem } from './database';
import { globalStoragePath } from './server';
import { eventRegistry } from './services/events';

const getCacheFile = () => path.join(globalStoragePath, 'corex_cache.json');
const getSrcDir = () => path.join(globalStoragePath, 'corex_src_cache');
const COREX_REPO = "https://github.com/Corex-Inc/Corex/archive/refs/heads/main.zip";
const DOC_REGEX = /\/\*\s*@doc\s+(\w+)[\s\S]*?\*\//g;

export async function loadOrUpdateCache(force = false) {
    const CACHE_FILE = getCacheFile();
    const SRC_DIR = getSrcDir();
    let metaCache: MetaItem[] =[];
    if (force || !fs.existsSync(CACHE_FILE) || !fs.existsSync(SRC_DIR)) {
        metaCache = await downloadAndParseCorex(COREX_REPO);
        fs.writeFileSync(CACHE_FILE, JSON.stringify(metaCache, null, 2));
    } else {
        metaCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
    db.build(metaCache);
    eventRegistry.build();
}

async function downloadAndParseCorex(url: string): Promise<MetaItem[]> {
    const SRC_DIR = getSrcDir();

    if (!fs.existsSync(SRC_DIR)) {
        fs.mkdirSync(SRC_DIR, { recursive: true });
    } else {
        fs.rmSync(SRC_DIR, { recursive: true, force: true });
        fs.mkdirSync(SRC_DIR, { recursive: true });
    }

    console.log(`[LSP] Downloading Corex from ${url}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
    
    const buffer = await response.arrayBuffer();
    const zip = new AdmZip(Buffer.from(buffer));

    try {
        zip.extractAllTo(SRC_DIR, true);
        console.log(`[LSP] Extraction complete to: ${SRC_DIR}`);
    } catch (e) {
        throw new Error(`Extraction failed: ${e}`);
    }

    const results: MetaItem[] = [];

    function walkDir(dir: string) {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                walkDir(fullPath);
            } else if (fullPath.endsWith('.java')) {
                const content = fs.readFileSync(fullPath, 'utf8');
                let match;
                DOC_REGEX.lastIndex = 0; 
                
                while ((match = DOC_REGEX.exec(content)) !== null) {
                    const lineNumber = content.substring(0, match.index).split('\n').length - 1;
                    
                    const relativePath = path.relative(SRC_DIR, fullPath);
                    
                    const parsed = parseBlock(match[1].toLowerCase(), match[0], relativePath, lineNumber);
                    results.push(...parsed);
                }
            }
        }
    }

    walkDir(SRC_DIR);
    
    if (results.length === 0) {
        console.error("[LSP] No @doc tags found in the downloaded source!");
    }

    return results;
}

function parseBlock(type: string, blockText: string, sourceFile: string, sourceLine: number): MetaItem[] {
    const rawResult: any = { type, description: '' };
    const lines = blockText.split('\n');
    let currentTag = '';
    let buffer: string[] =[];

    for (const line of lines) {
        let cleanLine = line.trimRight(); // Use trimRight to avoid removing leading whitespace
        const leadingSpaceMatch = cleanLine.match(/^\s*/);
        const leadingSpace = leadingSpaceMatch ? leadingSpaceMatch[0] : '';
        let stripped = cleanLine.substring(leadingSpace.length);
        
        if (stripped.endsWith('*/')) stripped = stripped.substring(0, stripped.length - 2).trimRight();
        
        if (stripped.startsWith('/*')) stripped = stripped.substring(stripped.startsWith('/**') ? 3 : 2).trimLeft();
        else if (stripped.startsWith('*')) {
            stripped = stripped.substring(1);
            if (stripped.startsWith(' ')) {
                stripped = stripped.substring(1);
            }
        }
        
        cleanLine = stripped;
        
        const trimmedCmd = cleanLine.trimLeft();
        if (trimmedCmd.startsWith('@')) {
            if (currentTag) {
                const joined = buffer.join('\n').trim();
                if (rawResult[currentTag]) rawResult[currentTag] += '\n\n' + joined;
                else rawResult[currentTag] = joined;
            }
            const spaceIdx = trimmedCmd.indexOf(' ');
            if (spaceIdx === -1) {
                currentTag = trimmedCmd.substring(1).toLowerCase();
                buffer =[];
            } else {
                currentTag = trimmedCmd.substring(1, spaceIdx).toLowerCase();
                buffer =[trimmedCmd.substring(spaceIdx + 1)]; // Don't trimLeft to preserve indent after tag
            }
        } else if (currentTag) { 
            buffer.push(cleanLine);
        }
    }

    if (currentTag) {
        if (rawResult[currentTag]) rawResult[currentTag] += '\n\n' + buffer.join('\n').trim();
        else rawResult[currentTag] = buffer.join('\n').trim();
    }
    
    if (!rawResult.name) return[];

    let reqArg: 'all' | number[] | undefined = undefined;
    if (rawResult.argrequired !== undefined) {
        if (rawResult.argrequired === '') reqArg = 'all';
        else reqArg = rawResult.argrequired.split(',').map((n: string) => parseInt(n.trim()));
    }

    let noArg: 'all' | number[] | undefined = undefined;
    if (rawResult.noarg !== undefined) {
        if (rawResult.noarg === '') noArg = 'all';
        else noArg = rawResult.noarg.split(',').map((n: string) => parseInt(n.trim()));
    }

    const cleanRawName = rawResult.name.replace(/<|>/g, '');

    return[{
        type: rawResult.type,
        name: cleanRawName,
        originalName: cleanRawName,
        object: rawResult.object,
        returnType: rawResult.returntype || 'ElementTag',
        description: rawResult.description,
        reqArg: reqArg,
        noArg: noArg,
        syntax: rawResult.syntax,
        implements: rawResult.implements,
        format: rawResult.format,
        prefix: rawResult.prefix,
        sourceFile,
        sourceLine,
        events: rawResult.events,
        switches: rawResult.switches,
        context: rawResult.context,
        usage: rawResult.usage,
        cancellable: rawResult.cancellable !== undefined,
        requiredargs: rawResult.requiredargs,
        maxargs: rawResult.maxargs,
        shortdescription: rawResult.shortdescription,
        aliases: rawResult.aliases ? rawResult.aliases.split(',').map((a: string) => a.trim().toLowerCase()) :[]
    }];
}
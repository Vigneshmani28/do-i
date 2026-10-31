import { Command } from 'commander';
import pc from 'picocolors';
import { analyze } from './analyzer.js';
import { renderHeader, renderJson, renderReport } from './render.js';
import { ShouldIError } from './types.js';

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('do-i')
    .description('Find out whether you should install an npm package')
    .version('0.1.0');

  program
    .command('install')
    .argument('<package>', 'npm package name, e.g. axios')
    .option('--json', 'print the raw report as JSON')
    .description('Assess an npm package before installing it')
    .action(async (name: string, options: { json?: boolean }) => {
      if (!options.json) console.log(renderHeader(name));
      const report = await analyze(name);
      console.log(options.json ? renderJson(report) : renderReport(report));
    });

  return program;
}

export async function run(argv: string[]): Promise<void> {
  try {
    await buildProgram().parseAsync(argv);
  } catch (err) {
    if (err instanceof ShouldIError) {
      console.error(`\n${pc.red('✗')} ${err.message}\n`);
    } else {
      console.error(`\n${pc.red('✗')} Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exitCode = 1;
  }
}

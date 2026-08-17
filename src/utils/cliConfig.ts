export function getCliValue(args: string[] = process.argv.slice(2), name: string) {
  const longFlag = `--${name}`;
  const equalsFlag = `--${name}=`;
  const equalsMatch = args.find((arg) => arg.startsWith(equalsFlag));
  if (equalsMatch) {
    return equalsMatch.slice(equalsFlag.length);
  }
  const index = args.indexOf(longFlag);
  if (index >= 0 && args[index + 1] !== undefined) {
    return args[index + 1];
  }
  if (name === 'port') {
    return args.find((arg) => /^\d+$/.test(arg)) ?? null;
  }
  if (name === 'host') {
    return args.find((arg) => !arg.startsWith('--') && !/^\d+$/.test(arg)) ?? null;
  }
  return null;
}

export function resolvePort(args: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env) {
  const fromCli = getCliValue(args, 'port');
  const parsed = Number(fromCli ?? env.PORT ?? '3000');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
}

export function resolveHost(args: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env) {
  const fromCli = getCliValue(args, 'host');
  const fromEnv = fromCli ?? env.HOST ?? env.APEX_HOST ?? '127.0.0.1';
  return (fromEnv || '127.0.0.1').trim();
}

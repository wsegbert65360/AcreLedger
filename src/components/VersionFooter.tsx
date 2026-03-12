import packageJson from '../../package.json';

export default function VersionFooter() {
  const version = packageJson.version;
  
  return (
    <div className="w-full py-8 flex flex-col items-center justify-center space-y-1">
      <p className="text-[12px] font-mono text-muted-foreground/40 uppercase tracking-widest">
        {version}-AcreLedger
      </p>
      <div className="h-px w-8 bg-muted-foreground/10" />
    </div>
  );
}

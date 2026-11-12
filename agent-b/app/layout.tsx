import './globals.css'; import type { ReactNode } from 'react';
export const metadata={title:'Finance App',description:'Personal finance tracking'};
const links=['dashboard','transactions','review','budgets','portfolio'];
export default function Layout({children}:{children:ReactNode}){return <html lang="en"><body><div className="shell"><header className="nav"><a href="/dashboard"><strong>Finance App</strong></a><nav>{links.map(x=><a key={x} href={`/${x}`}>{x==='dashboard'?'Dashboard':x[0].toUpperCase()+x.slice(1)}</a>)}</nav><a href="/accounts">More</a><button>Add transaction</button></header>{children}</div></body></html>}

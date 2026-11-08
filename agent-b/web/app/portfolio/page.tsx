'use client';
import {useState} from 'react';
import {api} from '../../components/api';
export default function Page(){const [result,setResult]=useState('');async function load(path:string){try{setResult(JSON.stringify(await api(path),null,2))}catch(e){setResult(e instanceof Error?e.message:'Failed')}}return <section><h1>Portfolio</h1><p>Prices use Alpha Vantage and are cached for fifteen minutes. If the price parameter or feed is unavailable, holdings show stale or unavailable prices.</p><button onClick={()=>load('/api/portfolio/valuation')}>Refresh valuation</button><button onClick={()=>load('/api/portfolio/liquidation')}>Estimate liquidation</button><pre>{result}</pre></section>}

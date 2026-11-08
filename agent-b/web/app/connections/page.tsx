'use client';
import {useState} from 'react';
import {api} from '../../components/api';
export default function Page(){const [result,setResult]=useState('');async function create(){try{setResult(JSON.stringify(await api('/api/connections/gmail',{method:'POST'}),null,2))}catch(e){setResult(e instanceof Error?e.message:'Failed')}}return <section><h1>Gmail connection</h1><p>Gmail Apps Script sends only bank-alert messages and labels them after a successful import.</p><button onClick={create}>Create Gmail token</button><pre>{result}</pre></section>}

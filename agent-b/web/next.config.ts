import type {NextConfig} from 'next';
import {createRequire} from 'node:module';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
export default function nextConfig(_phase?:string,{defaultConfig={}}:{defaultConfig?:NextConfig}={}) : NextConfig {return {...defaultConfig,output:'standalone',outputFileTracingRoot:join(process.cwd(),'..'),turbopack:{root:join(process.cwd(),'..')},adapterPath:require.resolve('cdk-nextjs/adapter')} as NextConfig;}

import Script from 'next/script';
import { ui } from '../lib/ui';
export default function Home(){return <><div dangerouslySetInnerHTML={{__html:ui}}/><Script src="/app.js" strategy="afterInteractive"/></>}

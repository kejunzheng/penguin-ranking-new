import React from 'react';
import {GitBranchIcon} from '@phosphor-icons/react';
import {assetUrl} from './asset-url';
import assets from '../public/assets/projects/manifest.json';
export default function ProjectLogo({item,lang='zh',large=false}){
 const asset=assets[item.fullName];
 const label=asset?`${asset.label} · ${asset.kind==='project-logo'?(lang==='zh'?'项目标志':'Project logo'):(lang==='zh'?'维护者头像':'Maintainer avatar')}`:item.name;
 return <span className={'project-logo'+(large?' large':'')} title={label}>{asset?<img src={assetUrl(asset.file)} alt={label} width="32" height="32" loading="lazy"/>:<GitBranchIcon size={24}/>}</span>;
}

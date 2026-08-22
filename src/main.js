import "./styles.css";
import { apiBaseForRuntime, isTauriRuntime } from "./runtime-environment.js";
import { detectPreferredLanguage } from "./locale.js";
import { clearProjectScopedTransactionState } from "./project-transaction-state.js";
import { operationsForWillRole, willWalletRole } from "./will-access.js";
import { open as openExternal } from "@tauri-apps/plugin-shell";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const API_BASE = apiBaseForRuntime(window.location, window);
const TAURI_RUNTIME = isTauriRuntime(window.location, window);
const DELETE_CONFIRMATION_PHRASE = "DELETE LOCAL WILL RECORD";
const WILL_TEMPLATE_IDS = new Set(["inheritance-vault","kcc20-inheritance-vault"]);
const en = {
  brandSub:"Kaspa digital inheritance",navHome:"Overview",navCreate:"Create will",navOperate:"Check in & claim",navPackages:"Multi-party packages",navWallet:"Local wallet",offlineTitle:"Local first",offlineText:"No website dependency; direct Kaspa node access",homeTitle:"Put on-chain assets in trusted hands",nodeChecking:"Connecting to TN10…",connectWallet:"Connect wallet",heroTitle:"Check in periodically. After timeout, rules deliver assets to the people you chose.",heroText:"Wallet, covenant compilation, transaction preflight and operation packages run locally. Kas Will only needs access to a Kaspa node and continues without any website.",createFirst:"Create your first will",openPackage:"Open package",metricWills:"Local wills",metricWillsSub:"Stored on this device",metricActive:"On-chain active",metricActiveSub:"Awaiting check-in or maturity",metricAssets:"Asset modes",metricAssetsSub:"KCC20 is TN10 experimental",plansTitle:"Estate plans",refresh:"Refresh",plansEmpty:"No wills yet. Create a TN10 test plan first.",formTitle:"Create an on-chain will",willName:"Will name",willNamePlaceholder:"For example: Family KAS will / Parent reserve",willNameHelp:"Used only in the local list and operation package display. It does not change on-chain rules.",assetType:"Asset type",lockedAmount:"Controller vault amount",period:"Inactivity period",minutes:"Minutes",hours:"Hours",days:"Days",weeks:"Weeks",owner:"Owner / check-in wallet",connectFirst:"Connect a local wallet first",ownerHelp:"This wallet can reset the timer or recover before maturity.",heirs:"Inheritors and shares",heirsHelp:"2–5 people, exactly 100% total",addHeir:"＋ Add inheritor",kcc20Experimental:"KCC20 experimental",kcc20ExperimentalText:"Accepts only descriptor-verified, four-field, non-minter TN10 tokens.",descriptor:"Token Descriptor JSON",descriptorPlaceholder:"Paste the issuer-provided descriptor JSON",verifyDescriptor:"Validate locally and fill parameters",buildWill:"Generate & compile deterministically",previewTitle:"How this will works",t1Title:"Deploy",t1Text:"Lock controller KAS in a unique Covenant UTXO.",t2Title:"Check in",t2Text:"The owner signs a same-Covenant-ID continuation and restarts the timer.",t3Title:"Maturity",t3Text:"Anyone may trigger, but recipients, shares and token template cannot be replaced.",legalTitle:"Technical tool, not a legal will",legalText:"Production use needs legal advice, key backups, informed inheritors and an independent security audit.",operateTitle:"Check in, recover and distribute",selectPlan:"Select a deployed will to inspect its on-chain state.",packagesTitle:"Portable multi-device operation packages",noServer:"No coordination server",packageImport:"Import .ssinvite",packageImportHelp:"Each participant reviews the same latest file on their own computer, signs matching slots, then passes it to the next participant.",inspect:"Read-only review",sign:"Sign my slot",packageReview:"Transaction review",packageEmpty:"Network, Covenant ID, inputs, outputs, fee and signatures appear here after import.",download:"Download latest package",broadcast:"Preflight & broadcast",walletEmpty:"Wallet keys are encrypted and stored only on this device.",refreshBalance:"Refresh balance",disconnect:"Disconnect",unlockWallet:"Connect an existing wallet",walletSelect:"Local wallet",walletPassword:"Wallet password (10+ characters)",paymentSecret:"Optional payment secret",connect:"Connect",createWallet:"Create / import wallet",walletName:"Wallet name",mnemonicOptional:"Mnemonic (leave empty to create)",newPassword:"New password (10+ characters)",confirmPassword:"Confirm password",createOrImport:"Create / import",authorize:"Local wallet authorization",authorizeHelp:"Passwords are sent only to the local 127.0.0.1 service and never written to plans or packages.",cancel:"Cancel",confirm:"Confirm",mnemonicTitle:"Mnemonic is shown once",mnemonicHelp:"Write it down offline. Never screenshot, upload, or send it to anyone.",mnemonicConfirm:"I completed an offline backup",done:"Done"
};
const msg = {
  zh:{wrong:"操作失败",walletNeeded:"请先连接本地钱包",passwordShort:"钱包密码至少需要 10 位",passwordMismatch:"两次输入的密码不一致",created:"遗嘱已固定编译，可核对后部署",deployed:"遗嘱已广播到 TN10",descriptorOk:"描述符结构已通过本地检查",descriptorBad:"描述符缺少严格 KCC20 四字段布局或固定模板参数",signed:"当前钱包签名完成",broadcasted:"交易已广播",copied:"已复制",notDeployed:"尚未部署",active:"活动中",mature:"已经到期",spent:"已经支出",unknown:"状态未知",checkIn:"签到续期",recover:"拥有者取回",inherit:"触发继承分配",deploy:"部署到 TN10",compile:"固定编译",delete:"删除",daysLeft:"预计剩余",localPass:"本地脚本引擎通过",walletCreated:"钱包已创建；请立即备份助记词",walletImported:"钱包已加密导入",confirmSign:"请确认你已核对网络、手续费、全部输入输出和 Covenant ID。继续签名？",confirmBroadcast:"请输入 BROADCAST REVIEWED COVENANT 以广播：",kcc20Builder:"KCC20 操作严格绑定 Token Covenant ID、模板哈希、当前 UTXO 和完整输入输出；仅限 TN10 实验。"},
  en:{wrong:"Operation failed",walletNeeded:"Connect a local wallet first",passwordShort:"Wallet password must contain at least 10 characters",passwordMismatch:"Wallet passwords do not match",created:"Will compiled deterministically; review it before deployment",deployed:"Will broadcast to TN10",descriptorOk:"Descriptor schema passed local validation",descriptorBad:"Descriptor lacks the strict four-field KCC20 layout or fixed template parameters",signed:"Current wallet signature completed",broadcasted:"Transaction broadcast",copied:"Copied",notDeployed:"Not deployed",active:"Active",mature:"Mature",spent:"Spent",unknown:"Unknown",checkIn:"Check in",recover:"Owner recovery",inherit:"Execute distribution",deploy:"Deploy to TN10",compile:"Pinned compile",delete:"Delete",daysLeft:"Estimated remaining",localPass:"Local script engine passed",walletCreated:"Wallet created; back up the mnemonic now",walletImported:"Wallet imported and encrypted",confirmSign:"Confirm that you reviewed the network, fee, every input/output and Covenant ID. Continue signing?",confirmBroadcast:"Enter BROADCAST REVIEWED COVENANT to broadcast:",kcc20Builder:"KCC20 operations bind the token Covenant ID, template hash, current UTXO and complete input/output set. TN10 experimental only."}
};
Object.assign(en,{navSettings:"Node settings",heirsHelp:"1–5 people, exactly 100% total; use 100% for one inheritor",lookupToken:"Look up token name on Kascov",tokenMetadataEmpty:"The name is display-only; asset identity still comes from the Covenant ID, template hash and on-chain state.",settingsTitle:"Kaspa node settings",settingsLocal:"Stored only on this device",tn10Node:"TN10 wRPC node",nodeHelp:"Leave blank for Kaspa Resolver discovery. For a local node enter ws://127.0.0.1:port; prefer wss:// for a remote custom node.",rpcUrl:"wRPC URL",testNode:"Test connection",useAuto:"Use automatic discovery",mainnetNode:"Mainnet wRPC node",mainnetDisabled:"Mainnet transactions remain disabled in this build; this only configures and tests a future node.",nodeResultEmpty:"A test shows network, sync status, latency, DAA and connection source.",saveNodes:"Save node settings",portableTitle:"Import or export a will operation package",portableHelp:"On another computer, the app reproduces the pinned template, compiler and hashes before showing actions allowed for the connected wallet.",exportSelected:"Export selected will",deleteSelected:"Delete selected record",roleEmpty:"Select or import a will to identify the connected wallet role.",openPackage:"Import will package",packageReview:"Review this operation",packageEmpty:"After selecting check-in, recovery or claim, the network, Covenant ID, inputs, outputs, fee and signatures appear here.",download:"Export transaction package",sign:"Sign this operation",broadcast:"Preflight & broadcast"});
Object.assign(msg.zh,{nodeSaved:"节点设置已保存",nodePassed:"节点连接测试通过",tokenFound:"Kascov 代币名称已找到",tokenNotFound:"Kascov 尚未索引这个 KCC20 Covenant ID",tokenLookupUnavailable:"Kascov 暂时不可用，不影响本地契约操作"});
Object.assign(msg.en,{nodeSaved:"Node settings saved",nodePassed:"Node connection test passed",tokenFound:"Kascov token name found",tokenNotFound:"Kascov has not indexed this KCC20 Covenant ID",tokenLookupUnavailable:"Kascov is unavailable; local covenant operations are unaffected"});

Object.assign(msg.zh,{createSuccess:"遗嘱草案创建成功",createFailed:"遗嘱创建失败",deploySuccess:"遗嘱已成功广播",deployFailed:"遗嘱部署失败",operationFailed:"操作失败",operationSuccess:"操作已成功广播",exportWill:"导出遗嘱操作包",deployNow:"立即部署",close:"关闭",kascovWaiting:"正在等待 Kascov 收录并返回验证结果…",kascovIndexed:"Kascov 已收录这笔交易",kascovPending:"Kascov 暂未收录，可稍后点击链接复查；不影响节点已经接受的广播结果。",openKascov:"在默认浏览器打开 Kascov",portableImported:"遗嘱操作包已验证并导入",portableImportFailed:"遗嘱操作包导入失败",templateRevision:"模板版本",templateRevisionCurrent:"当前模板",exportLegacyTitle:"已导出旧版模板操作包",exportLegacyText:"这份遗嘱使用历史版本的模板编译并部署。操作包只能在包含同一历史模板的 Kas Will 客户端导入；请把对方客户端升级到最新版本后再导入。",ownerRole:"当前钱包：遗嘱建立人，可签到续期或取回",inheritorRole:"当前钱包：继承人；到期后可触发提取",otherRole:"当前钱包：非建立人；只能在到期后触发提取，资产仍按遗嘱固定地址分配",disconnectedRole:"尚未连接钱包；连接后自动识别建立人或提取权限",packageReady:"操作交易已构建，请核对后签名或广播",claimReady:"提取交易已构建，请核对后广播",legacyWill:"旧版本本地记录",legacyWillText:"这是一条旧版本或不支持的本机记录。可以删除本机记录；不会影响链上资产。",deleteLocalWill:"删除本机记录",deleteWillConfirm:"这只会删除本机工作记录，不会撤回链上资产或改变 Covenant。确定删除？",deleteWillSuccess:"本机记录已删除",deleteWillFailed:"删除失败"});
Object.assign(msg.en,{createSuccess:"Will draft created",createFailed:"Will creation failed",deploySuccess:"Will broadcast successfully",deployFailed:"Will deployment failed",operationFailed:"Operation failed",operationSuccess:"Operation broadcast successfully",exportWill:"Export will operation package",deployNow:"Deploy now",close:"Close",kascovWaiting:"Waiting for Kascov indexing and verification evidence…",kascovIndexed:"Kascov has indexed this transaction",kascovPending:"Kascov has not indexed it yet. Recheck the link later; this does not change the node's accepted broadcast result.",openKascov:"Open Kascov in the default browser",portableImported:"Will operation package verified and imported",portableImportFailed:"Will operation package import failed",templateRevision:"Template revision",templateRevisionCurrent:"Current template",exportLegacyTitle:"Exported a legacy-template package",exportLegacyText:"This will was compiled and deployed with a historical template revision. Its package imports only into Kas Will clients that ship the same historical template; update the other client to the latest version before importing.",ownerRole:"Connected wallet: will creator; check-in and recovery are available",inheritorRole:"Connected wallet: inheritor; claim becomes available after maturity",otherRole:"Connected wallet: not the creator; only mature distribution can be triggered, and funds still go to the fixed inheritor addresses",disconnectedRole:"No wallet connected; connect one to identify creator or claim permissions",packageReady:"Operation transaction built. Review it before signing or broadcasting.",claimReady:"Claim transaction built. Review it before broadcasting.",legacyWill:"Legacy local record",legacyWillText:"This is an older or unsupported local record. You can delete the local record; on-chain assets are unaffected.",deleteLocalWill:"Delete local record",deleteWillConfirm:"This only deletes the local work record. It cannot revoke on-chain assets or change the Covenant. Continue?",deleteWillSuccess:"Local record deleted",deleteWillFailed:"Delete failed"});

Object.assign(msg.zh,{deleteDialogTitle:"删除本机遗嘱记录",deleteDialogHelpDeployed:"删除只移除本机工作记录，不会撤回链上资产或改变 Covenant，且不可撤销；删除后唯一的恢复方式是重新导入刚备份的操作包。",deleteDialogHelpDraft:"删除只移除本机工作记录，且不可撤销。",deleteBackupTitle:"第 1 步 · 备份操作包",deleteBackupHelp:"删除前必须先把当前操作包另存为备份文件；每次导出都会弹出保存窗口，必须手动选择保存位置，不会使用上次的目录。",backupNowButton:"另存备份操作包",deleteBackupSaved:"备份已保存",deleteBackupCancelled:"已取消保存。未完成备份前不能删除。",deletePhraseTitle:"第 2 步 · 输入确认短语",deletePhraseHelp:"请输入 DELETE LOCAL WILL RECORD 以确认删除。",deleteConfirmButton:"确认删除本机记录",exportCancelled:"已取消导出",packageSaved:"操作包已保存",exportFailed:"导出失败",countdownReached:"已到预计到期时间"});
Object.assign(msg.en,{deleteDialogTitle:"Delete local will record",deleteDialogHelpDeployed:"Deleting removes only the local work record; it cannot revoke on-chain assets or change the Covenant and cannot be undone. The only recovery is importing the package backup you are about to save.",deleteDialogHelpDraft:"Deleting removes only the local work record and cannot be undone.",deleteBackupTitle:"Step 1 · Back up the operation package",deleteBackupHelp:"A fresh package backup must be saved before this record can be deleted. Every export opens a save window and requires a manually chosen location; previous folders are never reused.",backupNowButton:"Save a backup package",deleteBackupSaved:"Backup saved",deleteBackupCancelled:"Save cancelled. Deletion stays blocked until the backup completes.",deletePhraseTitle:"Step 2 · Type the confirmation phrase",deletePhraseHelp:"Type DELETE LOCAL WILL RECORD to confirm deletion.",deleteConfirmButton:"Delete this local record",exportCancelled:"Export cancelled",packageSaved:"Package saved",exportFailed:"Export failed",countdownReached:"Estimated maturity reached"});

Object.assign(msg.zh,{operationInProgress:"已有操作正在进行，请等待完成",progressCreating:"生成遗嘱",progressCreateProject:"正在创建项目…",progressCompile:"正在固定编译契约…",progressDeploy:"部署遗嘱",progressDeployDraft:"正在构建部署交易…",progressDeployAuth:"等待钱包授权…",progressDeploySign:"正在签名…",progressDeployBroadcast:"本地预检并广播中…",progressDeploySave:"正在更新本机记录…",progressOperation:"构建操作",progressOperationBuild:"正在读取链上状态并构建交易…",progressSigning:"正在签名…",progressBroadcast:"预检并广播",progressRenewalWait:"续签交易已广播，正在等待节点确认并重置期限…",renewalWaitHelp:"倒计时会在确认后自动更新为新期限。",renewalConfirmed:"续签已确认，期限已重置",renewalStillWaiting:"仍在等待节点确认；稍后会自动刷新",renewalTitle:"等待续签确认",sendTitle:"发送 TKAS",sendHelp:"交易在本机构建、本地预检后签名广播；手续费在构建后显示。",sendRecipient:"收款地址",sendAmount:"金额（TKAS）",buildTransfer:"构建转账",confirmSend:"签名并发送",transferBuilt:"转账已构建，请核对后发送",transferSent:"转账已广播",transferSendConfirm:"请确认已核对收款地址、金额和手续费，并立即签名广播？",receiveTitle:"收款地址",sendFailed:"转账失败"});
Object.assign(msg.en,{operationInProgress:"An operation is already running; wait for it to finish",progressCreating:"Generating will",progressCreateProject:"Creating the project…",progressCompile:"Pinned compile of the covenant…",progressDeploy:"Deploying will",progressDeployDraft:"Building the deployment transaction…",progressDeployAuth:"Waiting for wallet authorization…",progressDeploySign:"Signing…",progressDeployBroadcast:"Local preflight and broadcast…",progressDeploySave:"Updating the local record…",progressOperation:"Building operation",progressOperationBuild:"Reading chain state and building the transaction…",progressSigning:"Signing…",progressBroadcast:"Preflight & broadcast",progressRenewalWait:"Check-in broadcast; waiting for the node to confirm and reset the period…",renewalWaitHelp:"The countdown updates automatically once confirmed.",renewalConfirmed:"Check-in confirmed; the period was reset",renewalStillWaiting:"Still waiting for node confirmation; it will refresh later",renewalTitle:"Awaiting check-in confirmation",sendTitle:"Send TKAS",sendHelp:"Transactions are built locally, preflighted by the local engine, then signed and broadcast; the fee appears after building.",sendRecipient:"Recipient address",sendAmount:"Amount (TKAS)",buildTransfer:"Build transfer",confirmSend:"Sign & send",transferBuilt:"Transfer built. Review it before sending.",transferSent:"Transfer broadcast",transferSendConfirm:"Confirm that you reviewed the recipient, amount and fee, then sign and broadcast now?",receiveTitle:"Receive address",sendFailed:"Transfer failed"});

Object.assign(msg.zh,{renewalOneClickConfirm:"即将签名并广播签到续期交易（手续费 {fee} TKAS），期限会从当前区块重新计算。继续？",checkInProgress:"签到续期"});
Object.assign(msg.en,{renewalOneClickConfirm:"This signs and broadcasts the check-in renewal (fee {fee} TKAS); the inactivity period restarts from the current block. Continue?",checkInProgress:"Check-in renewal"});
Object.assign(msg.zh,{kcc20WalletTitle:"KCC20 代币（TN10 实验）",kcc20WalletHelp:"余额来自 Kascov 仅供参考；发送前会用节点脚本哈希验证当前代币单元。",kcc20Empty:"尚未登记代币。粘贴发行方 descriptor 和一次当前 redeem program 完成登记。",kcc20AddToggle:"＋ 登记代币",kcc20Program:"当前 redeem program（hex，仅首次需要）",kcc20Register:"验证并登记",kcc20SendTitle:"发送 KCC20",kcc20SendToken:"代币",kcc20SendAmount:"数量",kcc20Registered:"代币已登记",kcc20BalanceUnknown:"余额暂不可用",kcc20RemoveConfirm:"从本机移除这个代币登记？不会影响链上资产。",kcc20TransferBuilt:"KCC20 转账已构建，请核对后签名广播。",kcc20TransferSent:"KCC20 转账已广播",kcc20NeedWallet:"请先连接钱包",kcc20Remove:"移除",kcc20PickRegistered:"从钱包已登记代币选择（可选）",kcc20PickManual:"— 手动粘贴 descriptor —",portableTrackNote:"操作包只需导入一次：建立人签到续期后，导入端会自动跟踪最新链上状态，无需重新导出。"});
Object.assign(msg.en,{kcc20WalletTitle:"KCC20 tokens (TN10 experimental)",kcc20WalletHelp:"Balances come from Kascov and are advisory; sending verifies the current token cell against the node's script hash first.",kcc20Empty:"No tokens registered yet. Paste the issuer descriptor and the current redeem program once to register.",kcc20AddToggle:"＋ Register a token",kcc20Program:"Current redeem program (hex; only needed once)",kcc20Register:"Verify & register",kcc20SendTitle:"Send KCC20",kcc20SendToken:"Token",kcc20SendAmount:"Amount",kcc20Registered:"Token registered",kcc20BalanceUnknown:"Balance unavailable",kcc20RemoveConfirm:"Remove this token registration from this device? On-chain assets are unaffected.",kcc20TransferBuilt:"KCC20 transfer built. Review it before signing and broadcasting.",kcc20TransferSent:"KCC20 transfer broadcast",kcc20NeedWallet:"Connect a wallet first",kcc20Remove:"Remove",kcc20PickRegistered:"Pick a wallet-registered token (optional)",kcc20PickManual:"— paste a descriptor manually —",portableTrackNote:"Import a package once: after the owner renews, the importing device follows the latest chain state automatically; no re-export is needed."});

const state = { language:"zh", token:"", config:null, settings:null, wallet:null, wallets:[], projects:[], templates:[], asset:"kas", tokenMetadata:null, package:null, review:null, operationId:"", activeProject:null, toastTimer:null, lifecycleRequestId:0, lifecycleController:null, nodeRefreshPromise:null, countdownTargetMs:null, countdownRefreshed:false, countdownTimer:null, operationBusy:false, transferDraft:null, kcc20Tokens:[], kcc20Package:null, kcc20Review:null };
try { state.language = detectPreferredLanguage({ storedLanguage:localStorage.getItem("kas-will-language"), languages:navigator.languages, timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone }); } catch {}

function t(key){ if(key==="connectWallet"&&state.language==="zh")return "连接钱包"; return msg[state.language]?.[key] || en[key] || key; }
function esc(value){ return String(value ?? "").replace(/[&<>'"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function short(value,left=10,right=8){ const s=String(value||""); return s.length>left+right+3?`${s.slice(0,left)}…${s.slice(-right)}`:s; }
function isWillProject(project){ return WILL_TEMPLATE_IDS.has(project?.review?.templateId); }
function formatDuration(seconds){ const n=Math.max(0,Math.floor(Number(seconds)||0)); const d=Math.floor(n/86400); const h=String(Math.floor((n%86400)/3600)).padStart(2,"0"); const m=String(Math.floor((n%3600)/60)).padStart(2,"0"); const s=String(n%60).padStart(2,"0"); return state.language==="zh"?`${d} 天 ${h}:${m}:${s}`:`${d}d ${h}:${m}:${s}`; }
function startCountdownTicker(){
  if(state.countdownTimer)return;
  state.countdownTimer=setInterval(()=>{
    const element=$("#lifecycle-remaining");
    if(!element||!state.countdownTargetMs)return;
    const remainingMs=state.countdownTargetMs-Date.now();
    if(remainingMs<=0){
      state.countdownTargetMs=null;
      element.textContent=t("countdownReached");
      if(!state.countdownRefreshed){state.countdownRefreshed=true;void renderLifecycle();}
      return;
    }
    element.textContent=formatDuration(remainingMs/1000);
  },250);
}
function toast(message,type="good"){ const el=$("#toast"); el.textContent=message; el.className=`toast show ${type}`; clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>el.className="toast",3600); }
function showProgress(title){ const el=$("#operation-progress"); if(!el)return; $("#operation-progress-title").textContent=title; $("#operation-progress-step").textContent=""; el.hidden=false; }
function progressStep(text){ const el=$("#operation-progress-step"); if(el&&text)el.textContent=text; }
function hideProgress(){ const el=$("#operation-progress"); if(el)el.hidden=true; }
// One mutating operation at a time: duplicate clicks while a deploy, transfer
// or broadcast is running are the main source of accidental double spends.
async function exclusive(fn){ if(state.operationBusy){ toast(t("operationInProgress"),"bad"); return; } state.operationBusy=true; try{ return await fn(); } finally{ state.operationBusy=false; } }

function showResult({ ok=true, title, message="", details=[], actions=[] }){
  const dialog=$("#result-dialog"),card=dialog.querySelector(".result-card");
  if(dialog.open)dialog.close(); card.classList.toggle("bad",!ok); $("#result-icon").textContent=ok?"✓":"!"; $("#result-title").textContent=title; $("#result-message").textContent=message;
  const detailRoot=$("#result-details");detailRoot.replaceChildren();
  for(const detail of details){const row=document.createElement("div"),label=document.createElement("span"),value=detail.href?document.createElement("a"):document.createElement("code");label.textContent=detail.label;value.textContent=detail.value;if(detail.href){value.href=detail.href;value.onclick=(event)=>{event.preventDefault();openUrl(detail.href);};}row.append(label,value);detailRoot.append(row);}
  const actionRoot=$("#result-actions");actionRoot.replaceChildren();
  const allActions=[...actions,{label:t("close"),className:"ghost",close:true}];
  for(const action of allActions){const button=document.createElement("button");button.textContent=action.label;button.className=action.className||"primary";button.onclick=async()=>{if(action.close!==false)dialog.close();if(action.onClick)await action.onClick();};actionRoot.append(button);}
  dialog.showModal();return dialog;
}
async function openUrl(url){try{await openExternal(url);}catch{window.open(url,"_blank","noopener,noreferrer");}}

function applyLanguage(){
  document.documentElement.lang=state.language==="zh"?"zh-CN":"en";
  $$('[data-i18n]').forEach((el)=>{ el.dataset.zh ||= el.textContent; const key=el.dataset.i18n; el.textContent=state.language==="en"?(en[key]||el.dataset.zh):el.dataset.zh; });
  $$('[data-i18n-placeholder]').forEach((el)=>{ el.dataset.zhPlaceholder ||= el.placeholder; const key=el.dataset.i18nPlaceholder; el.placeholder=state.language==="en"?(en[key]||el.dataset.zhPlaceholder):el.dataset.zhPlaceholder; });
  $("#lang-toggle").textContent=state.language==="zh"?"EN":"中文";
  renderHeirs(); renderProjects(); renderWallet(); renderPackageReview(); renderWalletRole(state.activeProject); renderTokenMetadata(); renderNodeSettings();
}

function page(name){
  if(name!=="operate"){
    state.lifecycleRequestId += 1;
    state.lifecycleController?.abort();
    state.lifecycleController = null;
    state.countdownTargetMs = null;
  }
  $$(".page").forEach((el)=>el.classList.toggle("active",el.id===`page-${name}`));
  $$(".nav").forEach((el)=>el.classList.toggle("active",el.dataset.page===name));
  const titles={home:["ESTATE OVERVIEW",state.language==="zh"?"把链上资产交给未来":"Put on-chain assets in trusted hands"],create:["NEW ESTATE PLAN",state.language==="zh"?"创建链上遗嘱":"Create an on-chain will"],operate:["COVENANT LIFECYCLE",state.language==="zh"?"签到、取回与到期分配":"Check in, recover and distribute"],packages:["PORTABLE AUTHORIZATION",state.language==="zh"?"跨设备多人操作包":"Portable multi-device packages"],wallet:["LOCAL ENCRYPTED WALLET",state.language==="zh"?"本地钱包":"Local wallet"],settings:["DIRECT NODE ACCESS",state.language==="zh"?"Kaspa 节点设置":"Kaspa node settings"]};
  $("#page-eyebrow").textContent=titles[name][0]; $("#page-title").textContent=titles[name][1];
  if(name==="operate") void renderLifecycle();
  if(name==="wallet") void loadKcc20Tokens();
}

const SERVER_ERROR_TEXT={
  RENEWAL_EXPIRED:{zh:"遗嘱已到期，不能再签到续期；到期后只能触发继承分配。",en:"The will has matured and can no longer be renewed; only the mature distribution is available."},
  RENEWAL_ALREADY_SPENT:{zh:"该遗嘱金库已被支出，无法续期。",en:"This will vault has already been spent."},
  INHERITANCE_NOT_MATURE:{zh:"遗嘱尚未到期，暂时不能触发继承分配。",en:"The will has not matured yet; distribution is not available."},
  INHERITANCE_ALREADY_SPENT:{zh:"该遗嘱资产已被支出。",en:"This will has already been spent."},
  PROJECT_DELETE_BACKUP_REQUIRED:{zh:"请先备份操作包，再删除本机记录。",en:"Back up the operation package before deleting this record."},
  PROJECT_DELETE_BACKUP_MISMATCH:{zh:"备份的操作包与当前记录不一致，请重新导出备份。",en:"The backed-up package does not match this record; export a fresh backup."},
  PROJECT_DELETE_CONFIRMATION_REQUIRED:{zh:"需要输入删除确认短语 DELETE LOCAL WILL RECORD。",en:"Type DELETE LOCAL WILL RECORD to confirm."},
  COVENANT_UTXO_NOT_FOUND:{zh:"未在节点上找到该 Covenant 的未花费输出；若刚广播过交易，请稍等链上确认后刷新。",en:"The covenant's unspent output was not found on the node; if a transaction was just broadcast, wait for confirmation and refresh."},
  KCC20_CELL_NOT_FOUND:{zh:"未找到当前钱包的 KCC20 代币单元；请粘贴最新的 redeem program。",en:"The wallet's current KCC20 cell was not found; paste the latest redeem program."},
  KCC20_TOKEN_NOT_REGISTERED:{zh:"该 KCC20 代币尚未在本机登记。",en:"This KCC20 token is not registered on this device."}
};

async function api(path,options={}){
  const headers={"content-type":"application/json",...(options.headers||{})}; if(state.token && !["GET","HEAD"].includes(options.method||"GET"))headers["x-studio-token"]=state.token;
  const response=await fetch(`${API_BASE}${path}`,{...options,headers}); let payload={}; try{payload=await response.json();}catch{}
  if(!response.ok){
    const friendly=SERVER_ERROR_TEXT[String(payload.code||"")]?.[state.language];
    throw Object.assign(new Error(friendly||payload.error||`${response.status} ${response.statusText}`),{payload,status:response.status,technicalMessage:payload.error||""});
  }
  return payload;
}
async function waitForApi(){ for(let i=0;i<35;i+=1){ try{return await api("/api/session");}catch{ await new Promise(r=>setTimeout(r,300)); } } throw new Error("Kas Will local service did not start"); }

async function refreshNode(){
  if(state.nodeRefreshPromise)return state.nodeRefreshPromise;
  state.nodeRefreshPromise=(async()=>{try{ const node=await api("/api/node/status?network=tn10"); $("#node-dot").className="good"; const source=node.discoveredBy==="custom-rpc"?(state.language==="zh"?"自定义":"custom"):(state.language==="zh"?"自动":"auto"); $("#node-state").textContent=`TN10 · ${source} · ${Number(node.virtualDaaScore||0).toLocaleString()}`; }catch(error){ $("#node-dot").className="bad"; $("#node-state").textContent=state.language==="zh"?"TN10 节点未连接":"TN10 node unavailable"; }finally{state.nodeRefreshPromise=null;}})();
  return state.nodeRefreshPromise;
}

function renderNodeSettings(){if(!state.settings)return;const tn=$("#tn10-rpc-url"),main=$("#mainnet-rpc-url");if(tn&&document.activeElement!==tn)tn.value=state.settings.tn10RpcUrl||"";if(main&&document.activeElement!==main)main.value=state.settings.mainnetRpcUrl||"";}
function renderNodeTest(node){const el=$("#node-test-result");if(!el||!node)return;el.innerHTML=`<div class="node-details"><div><span>Network</span><b>${esc(node.kaspaNetworkId)}</b></div><div><span>${state.language==="zh"?"同步":"Synced"}</span><b>${node.synced?(state.language==="zh"?"是":"Yes"):(state.language==="zh"?"否":"No")}</b></div><div><span>${state.language==="zh"?"延迟":"Latency"}</span><b>${esc(node.latencyMs)} ms</b></div><div><span>Virtual DAA</span><b>${Number(node.virtualDaaScore||0).toLocaleString()}</b></div><div><span>${state.language==="zh"?"来源":"Source"}</span><b>${esc(node.discoveredBy)}</b></div><div><span>${state.language==="zh"?"版本":"Version"}</span><b>${esc(node.serverVersion||"—")}</b></div></div>`;}
async function testNode(network,silent=false){const rpcUrl=$(network==="tn10"?"#tn10-rpc-url":"#mainnet-rpc-url").value.trim();try{const {node}=await api("/api/node/test",{method:"POST",body:JSON.stringify({network,rpcUrl})});renderNodeTest(node);if(!silent)toast(t("nodePassed"));return node;}catch(error){if(!silent){toast(error.message,"bad");return null;}throw error;}}
async function saveNodeSettings(){const input={tn10RpcUrl:$("#tn10-rpc-url").value.trim(),mainnetRpcUrl:$("#mainnet-rpc-url").value.trim()};try{if(input.tn10RpcUrl)await testNode("tn10",true);if(input.mainnetRpcUrl)await testNode("mainnet",true);const {settings}=await api("/api/settings",{method:"PUT",body:JSON.stringify(input)});state.settings=settings;renderNodeSettings();await refreshNode();toast(t("nodeSaved"));}catch(error){toast(error.message,"bad");}}
async function useAutomaticNode(network){$(network==="tn10"?"#tn10-rpc-url":"#mainnet-rpc-url").value="";await saveNodeSettings();}

function renderHeirs(){
  const list=$("#heirs-list"); if(!list)return; const rows=[...list.querySelectorAll(".heir-row")].map((r)=>({address:r.querySelector(".heir-address")?.value||"",share:r.querySelector(".heir-share")?.value||""}));
  const values=rows.length?rows:[{address:"",share:"100"}];
  list.innerHTML=values.map((row,index)=>`<div class="heir-row"><input class="heir-address" value="${esc(row.address)}" placeholder="kaspatest:…" aria-label="Inheritor ${index+1}"/><div class="input-suffix"><input class="heir-share" type="number" min="0.01" max="100" step="0.01" value="${esc(row.share)}"/><b>%</b></div><button class="remove-heir" type="button" data-index="${index}">×</button></div>`).join("");
  $$(".remove-heir").forEach((button)=>button.onclick=()=>{ if($$(".heir-row").length<=1)return toast(state.language==="zh"?"至少需要一位继承人":"At least one inheritor is required","bad"); button.closest(".heir-row").remove(); });
}
function addHeir(){ if($$(".heir-row").length>=5)return toast(state.language==="zh"?"最多五位继承人":"Maximum five inheritors","bad"); $("#heirs-list").insertAdjacentHTML("beforeend",`<div class="heir-row"><input class="heir-address" placeholder="kaspatest:…"/><div class="input-suffix"><input class="heir-share" type="number" min="0.01" max="100" step="0.01" value="0"/><b>%</b></div><button class="remove-heir" type="button">×</button></div>`); renderHeirs(); }
function selectAsset(asset){ state.asset=asset; $$(".segment").forEach((el)=>el.classList.toggle("active",el.dataset.asset===asset)); $("#kcc20-fields").hidden=asset!=="kcc20"; if(asset==="kcc20"&&!state.kcc20Tokens.length&&state.wallet)void loadKcc20Tokens(); }

function strictDescriptor(raw){
  const descriptor=typeof raw==="string"?JSON.parse(raw):raw; const root=descriptor.descriptor||descriptor; const id=String(root.covenantId||root.covenant_id||"").toLowerCase(); const hash=String(root.templateHash||root.template_hash||root.expectedTemplateHash||"").toLowerCase(); const prefix=String(root.prefix||root.templatePrefix||"").replace(/^0x/,""); const suffix=String(root.suffix||root.templateSuffix||"").replace(/^0x/,"");
  const prefixLength=Number(root.templatePrefixLen??root.template_prefix_len??(prefix&&prefix.length/2)); const suffixLength=Number(root.templateSuffixLen??root.template_suffix_len??(suffix&&suffix.length/2)); const layout=root.stateLayout||root.state_layout||[]; const normalized=Array.isArray(layout)?layout.map((v)=>`${v.name||v.field}:${v.type||v.type_name}`):Object.entries(layout).map(([k,v])=>`${k}:${v}`); const expected=["ownerIdentifier:byte[32]","identifierType:byte","amount:int","isMinter:bool"]; const canonical=normalized.map(v=>v.replace(/owner_identifier/,"ownerIdentifier").replace(/identifier_type/,"identifierType").replace(/is_minter/,"isMinter"));
  if(!/^[0-9a-f]{64}$/.test(id)||!/^[0-9a-f]{64}$/.test(hash)||!Number.isSafeInteger(prefixLength)||prefixLength<0||!Number.isSafeInteger(suffixLength)||suffixLength<1||expected.some((v,i)=>canonical[i]!==v))throw new Error(t("descriptorBad")); return{id,hash,prefixLength,suffixLength};
}
function renderTokenMetadata(){const el=$("#token-metadata");if(!el)return;const metadata=state.tokenMetadata;if(!metadata){el.className="metadata-result empty";el.textContent=state.language==="zh"?"名称仅用于显示；资产身份仍以 Covenant ID、模板哈希和链上状态为准。":"The name is display-only; asset identity still comes from the Covenant ID, template hash and on-chain state.";return;}if(!metadata.found){el.className="metadata-result empty";el.textContent=t("tokenNotFound");return;}el.className="metadata-result";el.innerHTML=`<strong>${esc(metadata.name||metadata.ticker||"KCC20")}</strong>${metadata.ticker?` · ${esc(metadata.ticker)}`:""}<br><small>Kascov · ${esc(metadata.validationStatus||metadata.status||"unvalidated")}${metadata.supply!=null?` · Supply ${esc(metadata.supply)}`:""}${metadata.holders!=null?` · ${esc(metadata.holders)} holders`:""}</small><br><code>${esc(metadata.covenantId)}</code>`;}
async function lookupTokenMetadata(silent=false){const covenantId=$("#token-covid").value.trim().toLowerCase();if(!/^[0-9a-f]{64}$/.test(covenantId)){if(!silent)toast(state.language==="zh"?"请先填写 64 位 Covenant ID":"Enter a 64-character Covenant ID first","bad");return null;}try{const {metadata}=await api(`/api/kcc20/metadata?network=tn10&covenantId=${encodeURIComponent(covenantId)}`);state.tokenMetadata=metadata;renderTokenMetadata();if(!silent)toast(metadata.found?t("tokenFound"):t("tokenNotFound"),metadata.found?"good":"bad");return metadata;}catch(error){state.tokenMetadata=null;renderTokenMetadata();if(!silent)toast(`${t("tokenLookupUnavailable")}: ${error.message}`,"bad");return null;}}
function parseDescriptor(){ try{ const d=strictDescriptor($("#token-descriptor").value); $("#token-covid").value=d.id; $("#token-template-hash").value=d.hash; $("#token-prefix").value=d.prefixLength; $("#token-suffix").value=d.suffixLength; state.tokenMetadata=null;renderTokenMetadata();toast(t("descriptorOk"));void lookupTokenMetadata(true); }catch(error){toast(error.message,"bad");} }

async function loadWallets(){ const payload=await api("/api/wallets"); state.wallets=payload.wallets||[]; $("#wallet-select").innerHTML=state.wallets.length?state.wallets.map(w=>`<option value="${esc(w.id)}">${esc(w.title)} · ${esc(short(w.publicKey,7,5))}</option>`).join(""):`<option value="">${state.language==="zh"?"暂无本地钱包":"No local wallet"}</option>`; }
function renderWallet(){
  $("#owner-address").value=state.wallet?.address||""; $("#wallet-chip").textContent=state.wallet?short(state.wallet.address,9,6):(state.language==="zh"?"连接钱包":"Connect wallet");
  const el=$("#wallet-connected"); if(!state.wallet){el.innerHTML=`<div class="empty">${state.language==="zh"?"钱包密钥只在本机加密保存。":"Wallet keys are encrypted and stored only on this device."}</div>`;return;}
  const balance=state.wallet.balance; el.innerHTML=`<div class="account-balance">${esc(balance?.balanceKas||"—")} <small>TKAS</small></div><div>${esc(state.wallet.title||"Kas Will Wallet")}</div><p class="account-address">${esc(state.wallet.address)}</p><button class="mini" id="copy-wallet">${state.language==="zh"?"复制地址":"Copy address"}</button>`; $("#copy-wallet").onclick=()=>copyText(state.wallet.address);
}
async function unlockWallet(){ const id=$("#wallet-select").value,pw=$("#wallet-password").value; if(!id)return; if(pw.length<10)return toast(t("passwordShort"),"bad"); try{const {wallet}=await api(`/api/wallets/${encodeURIComponent(id)}/unlock`,{method:"POST",body:JSON.stringify({walletSecret:pw,paymentSecret:$("#wallet-payment").value,network:"tn10"})});state.wallet={...wallet,walletId:wallet.id};$("#wallet-password").value="";$("#wallet-payment").value="";await refreshBalance();renderWallet();void loadKcc20Tokens();if(state.activeProject)await renderLifecycle();toast(state.language==="zh"?"钱包已连接":"Wallet connected");}catch(e){toast(e.message,"bad");}}
async function refreshBalance(){ if(!state.wallet)return; try{const {balance}=await api(`/api/wallets/balance?network=tn10&address=${encodeURIComponent(state.wallet.address)}`);state.wallet.balance=balance;renderWallet();}catch(e){toast(e.message,"bad");} }
async function createWallet(){ const pw=$("#new-wallet-password").value; if(pw.length<10)return toast(t("passwordShort"),"bad"); if(pw!==$("#new-wallet-confirm").value)return toast(t("passwordMismatch"),"bad"); try{const payload=await api("/api/wallets",{method:"POST",body:JSON.stringify({title:$("#new-wallet-name").value,walletSecret:pw,mnemonic:$("#new-wallet-mnemonic").value.trim()})});await loadWallets();$("#wallet-select").value=payload.wallet.id;$("#new-wallet-password").value=$("#new-wallet-confirm").value=$("#new-wallet-mnemonic").value="";if(payload.recoveryPhrase){$("#mnemonic-value").textContent=payload.recoveryPhrase;$("#mnemonic-check").checked=false;$("#mnemonic-close").disabled=true;$("#mnemonic-dialog").showModal();toast(t("walletCreated"));}else toast(t("walletImported"));}catch(e){toast(e.message,"bad");}}
function disconnectWallet(){state.wallet=null;renderWallet();void loadKcc20Tokens();if(state.activeProject)void renderLifecycle();}
async function copyText(value){await navigator.clipboard.writeText(String(value));toast(t("copied"));}

async function loadProjects(){
  const {projects}=await api("/api/projects"); const full=await Promise.all((projects||[]).map(async p=>{try{return (await api(`/api/projects/${encodeURIComponent(p.id)}`)).project;}catch{return p;}})); state.projects=full.filter(Boolean);
  renderProjects(); renderProjectSelect();
}
function renderProjects(){
  const plans=$("#plans"); if(!plans)return; $("#metric-wills").textContent=state.projects.length; $("#metric-active").textContent=state.projects.filter(p=>isWillProject(p)&&p.deployment?.status!=="spent"&&p.deployment?.txid).length;
  if(!state.projects.length){plans.innerHTML=`<div class="empty">${state.language==="zh"?"还没有遗嘱。先创建一个 TN10 测试计划。":"No wills yet. Create a TN10 test plan first."}</div>`;return;}
  plans.innerHTML=state.projects.map(p=>{if(!isWillProject(p)){return`<article class="plan"><div class="plan-head"><div><span class="eyebrow">${esc(p.network||"LOCAL")} · LEGACY</span><h4>${esc(p.name||p.id)}</h4></div><span class="badge">${t("legacyWill")}</span></div><p>${t("legacyWillText")}</p><div class="plan-meta"><span>${state.language==="zh"?"模板":"Template"}<b>${esc(p.review?.templateId||p.templateId||"—")}</b></span><span>${state.language==="zh"?"更新":"Updated"}<b>${p.updatedAt?esc(new Date(p.updatedAt).toLocaleDateString()):"—"}</b></span></div><div class="button-row"><button class="danger delete-plan" data-id="${esc(p.id)}">${t("deleteLocalWill")}</button></div></article>`;}const kcc=p.review?.templateId==="kcc20-inheritance-vault";const heirs=p.templateParameters?.inheritors?.length||0;const tokenName=p.templateParameters?.tokenDisplayName||"KCC20";return`<article class="plan"><div class="plan-head"><div><span class="eyebrow">${kcc?esc(tokenName):"KAS"} · TN10</span><h4>${esc(p.name)}</h4></div><span class="badge ${kcc?"experimental":""}">${p.deployment?.txid?(state.language==="zh"?"链上":"ON CHAIN"):(state.language==="zh"?"草案":"DRAFT")}</span></div><p>${kcc?(state.language==="zh"?`描述符绑定的实验 Token 遗嘱 · ${esc(tokenName)}`:`Descriptor-bound experimental token will · ${esc(tokenName)}`):(state.language==="zh"?"一至五位继承人的签到型 KAS 金库":"Check-in KAS vault for one to five inheritors")}</p><div class="plan-meta"><span>${state.language==="zh"?"继承人":"Inheritors"}<b>${heirs}</b></span><span>${state.language==="zh"?"期限":"Period"}<b>${esc(p.templateParameters?.inactivityDays?.value||"—")} ${esc(p.templateParameters?.inactivityDays?.unit||"")}</b></span></div><div class="button-row">${p.deployment?.txid?`<button class="ghost operate-plan" data-id="${esc(p.id)}">${state.language==="zh"?"查看与操作":"View & operate"}</button>`:`<button class="primary deploy-plan" data-id="${esc(p.id)}">${t("deploy")}</button>`}<button class="ghost export-will" data-id="${esc(p.id)}">${esc(t("exportWill"))}</button><button class="danger delete-plan" data-id="${esc(p.id)}">${t("delete")}</button></div></article>`}).join("");
  $$(".deploy-plan").forEach(b=>b.onclick=()=>deployProject(b.dataset.id)); $$(".operate-plan").forEach(b=>b.onclick=()=>{$("#operate-project").value=b.dataset.id;page("operate");}); $$(".export-will").forEach(b=>b.onclick=()=>downloadWillPackage(b.dataset.id)); $$(".delete-plan").forEach(b=>b.onclick=()=>deleteProject(b.dataset.id));
}
function renderProjectSelect(){ const select=$("#operate-project"); if(!select)return; const selected=select.value; const wills=state.projects.filter(isWillProject); select.innerHTML=`<option value="">${state.language==="zh"?"选择遗嘱":"Select a will"}</option>`+wills.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(""); if(wills.some(p=>p.id===selected))select.value=selected; }
function requestDeleteConfirmation(project){
  return new Promise((resolve)=>{
    const dialog=$("#delete-dialog");
    const requiresBackup=isWillProject(project)&&Boolean(project?.deployment?.txid)&&Boolean(project?.artifact);
    const backupStep=$("#delete-backup-step"),backupButton=$("#delete-backup-button"),backupResult=$("#delete-backup-result");
    const phraseInput=$("#delete-phrase-input"),confirmButton=$("#delete-confirm-button");
    $("#delete-dialog-help").textContent=project?.deployment?.txid?t("deleteDialogHelpDeployed"):t("deleteDialogHelpDraft");
    $("#delete-record-name").textContent=project?.name||project?.id||"";
    backupStep.hidden=!requiresBackup;
    $("#delete-phrase-step-badge").textContent=requiresBackup?"2":"1";
    phraseInput.value="";
    backupResult.hidden=true;backupResult.textContent="";
    let backup=null;
    const update=()=>{confirmButton.disabled=!((!requiresBackup||backup)&&phraseInput.value.trim()===DELETE_CONFIRMATION_PHRASE);};
    phraseInput.oninput=update;
    backupButton.onclick=async()=>{
      backupButton.disabled=true;backupResult.hidden=false;backupResult.className="delete-backup-result pending";
      backupResult.textContent=state.language==="zh"?"正在导出，请在弹出的窗口中选择保存位置…":"Exporting; choose a location in the save window…";
      const saved=await downloadWillPackage(project.id);
      backupButton.disabled=false;
      if(!saved){backup=null;backupResult.textContent=t("deleteBackupCancelled");update();return;}
      backup=saved;
      backupResult.className="delete-backup-result";
      backupResult.textContent=`${t("deleteBackupSaved")}: ${saved.path}`;
      update();
    };
    const close=()=>{dialog.removeEventListener("close",close);phraseInput.oninput=null;backupButton.onclick=null;resolve(dialog.returnValue==="confirm"?{backupCommitment:backup?.commitment||""}:null);};
    dialog.addEventListener("close",close);
    update();
    dialog.showModal();
  });
}
async function deleteProject(id){
  let project=state.projects.find(p=>p.id===id);
  if(!project){try{project=(await api(`/api/projects/${encodeURIComponent(id)}`)).project;}catch{project=null;}}
  const decision=await requestDeleteConfirmation(project);
  if(!decision)return;
  try{await api(`/api/projects/${encodeURIComponent(id)}`,{method:"DELETE",body:JSON.stringify({confirmation:DELETE_CONFIRMATION_PHRASE,backupCommitment:decision.backupCommitment})});if(state.activeProject?.id===id||$("#operate-project")?.value===id){state.lifecycleRequestId+=1;state.lifecycleController?.abort();state.lifecycleController=null;state.countdownTargetMs=null;clearProjectScopedTransactionState(state);state.package=null;state.review=null;state.operationId="";state.activeProject=null;$("#operation-review").hidden=true;renderPackageReview();const select=$("#operate-project");if(select)select.value="";}await loadProjects();renderWalletRole(null);const card=$("#lifecycle-card");if(card)card.innerHTML=`<div class="empty">${state.language==="zh"?"选择一个遗嘱查看链上状态。":"Select a will to inspect."}</div>`;showResult({title:t("deleteWillSuccess"),message:state.language==="zh"?"只删除了本机工作记录；链上 Covenant 和资产状态没有被改变。":"Only the local work record was deleted; the on-chain Covenant and assets were not changed.",details:[{label:"Record",value:project?.name||id}]});}catch(e){showResult({ok:false,title:t("deleteWillFailed"),message:e.message});}}
function safeDownloadName(value){return String(value||"kas-will").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48)||"kas-will";}
function browserDownload(contents,fileName){const blob=new Blob([contents],{type:"application/json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
// Every package export must pick a save location by hand: in the desktop app
// the native save dialog opens each time; the browser build falls back to a
// plain download because it cannot force a picker.
async function saveTextFile(contents,fileName){
  if(TAURI_RUNTIME){
    try{
      const [{save},{invoke}]=await Promise.all([import("@tauri-apps/plugin-dialog"),import("@tauri-apps/api/core")]);
      const extension=fileName.includes(".")?fileName.split(".").pop().toLowerCase():"json";
      const target=await save({defaultPath:fileName,filters:[{name:"Kas Will package",extensions:[extension]}]});
      if(!target)return null;
      await invoke("export_text_file",{path:target,contents});
      return target;
    }catch(e){toast(e.message,"bad");return null;}
  }
  browserDownload(contents,fileName);
  return fileName;
}
async function downloadWillPackage(id){try{const payload=await api(`/api/projects/${encodeURIComponent(id)}/portable-will`);const project=state.projects.find((item)=>item.id===id);const revision=payload.package.payload?.project?.templateRevision;const fileName=`${safeDownloadName(project?.name)}-${payload.package.commitment.slice(0,10)}.ssinvite`;const saved=await saveTextFile(JSON.stringify(payload.package,null,2),fileName);if(saved===null){toast(t("exportCancelled"),"bad");return null;}toast(`${t("packageSaved")}: ${saved}`);if(revision&&revision!=="current"){showResult({ok:false,title:t("exportLegacyTitle"),message:t("exportLegacyText"),details:[{label:t("templateRevision"),value:revision},{label:"Commitment",value:payload.package.commitment}]});}return {commitment:payload.package.commitment,path:saved};}catch(e){showResult({ok:false,title:t("exportFailed"),message:e.message});return null;}}
async function importWillPackage(file){try{if(!file)throw new Error(state.language==="zh"?"请选择 .ssinvite 文件":"Select an .ssinvite file");const raw=await file.text();const payload=await api("/api/portable-wills/import",{method:"POST",body:JSON.stringify({package:raw,language:state.language})});await loadProjects();$("#operate-project").value=payload.project.id;page("operate");showResult({title:t("portableImported"),message:state.language==="zh"?"模板、固定编译器、程序哈希和部署身份均已核对。":"The template, pinned compiler, program hash and deployment identity were verified.",details:[{label:"Commitment",value:payload.commitment},{label:t("templateRevision"),value:payload.templateRevision&&payload.templateRevision!=="current"?payload.templateRevision:t("templateRevisionCurrent")},{label:"Covenant ID",value:payload.project.deployment?.covenantId||t("notDeployed")}]});}catch(e){showResult({ok:false,title:t("portableImportFailed"),message:e.message});}finally{$("#will-package-file").value="";}}
function showDeploymentResult(projectId,result){const details=[{label:"TXID",value:result.txid},{label:"Covenant ID",value:result.covenantId},{label:"Kascov transaction",value:t("kascovWaiting"),href:result.kascovTransactionUrl},{label:"Kascov Covenant",value:result.kascovCovenantUrl,href:result.kascovCovenantUrl}];showResult({title:t("deploySuccess"),message:t("kascovWaiting"),details,actions:[{label:t("exportWill"),className:"ghost",onClick:()=>downloadWillPackage(projectId)},{label:t("openKascov"),onClick:()=>openUrl(result.kascovTransactionUrl)}]});$("#result-dialog").dataset.txid=result.txid;}
async function pollKascovEvidence(result){let unavailable=false;for(let attempt=0;attempt<10;attempt+=1){try{const payload=await api(`/api/transactions/tn10/${result.txid}`);if(payload.indexed){if($("#result-dialog").dataset.txid===result.txid){$("#result-message").textContent=t("kascovIndexed");const rows=$("#result-details").querySelectorAll("div");if(rows[2])rows[2].querySelector("a").textContent=String(payload.evidence?.validationStatus||payload.evidence?.status||payload.evidence?.verdict||"Indexed");}return;}unavailable=payload.kascovAvailable===false;}catch{unavailable=true;}await new Promise((resolve)=>setTimeout(resolve,3000));}if($("#result-dialog").dataset.txid===result.txid)$("#result-message").textContent=unavailable?`${t("kascovPending")} (${state.language==="zh"?"服务暂不可用":"service unavailable"})`:t("kascovPending");}

async function createWill(event){
  event.preventDefault(); if(!state.wallet)return showResult({ok:false,title:t("createFailed"),message:t("walletNeeded"),actions:[{label:t("connectWallet"),onClick:()=>page("wallet")}]}); const rows=$$(".heir-row").map(r=>({address:r.querySelector(".heir-address").value.trim(),shareBps:Math.round(Number(r.querySelector(".heir-share").value)*100)})); const templateId=state.asset==="kcc20"?"kcc20-inheritance-vault":"inheritance-vault";
  const parameters={amountKas:$("#amount").value,ownerAddress:state.wallet.address,inheritors:rows,inactivityDays:{value:Number($("#period-value").value),unit:$("#period-unit").value}};
  if(state.asset==="kcc20"){const covenantId=$("#token-covid").value.trim().toLowerCase();Object.assign(parameters,{tokenCovenantId:covenantId,tokenDisplayName:state.tokenMetadata?.found&&state.tokenMetadata.covenantId===covenantId?(state.tokenMetadata.name||state.tokenMetadata.ticker||""):"",tokenTemplatePrefixLength:Number($("#token-prefix").value),tokenTemplateSuffixLength:Number($("#token-suffix").value),tokenTemplateHash:$("#token-template-hash").value.trim()});} const button=$("#create-will");button.disabled=true;
  await exclusive(async()=>{
    showProgress(t("progressCreating"));
    try{
      progressStep(t("progressCreateProject"));const name=$("#will-name").value.trim();const {project}=await api(`/api/templates/${templateId}/projects`,{method:"POST",body:JSON.stringify({network:"tn10",parameters,language:state.language,name})});
      progressStep(t("progressCompile"));const {artifact}=await api("/api/contracts/compile",{method:"POST",body:JSON.stringify({projectId:project.id,templateId,source:project.source,constructorArgs:project.constructorArgs,compilerProfileId:"latest-023c7ee"})}); const saved=(await api(`/api/projects/${project.id}`,{method:"PUT",body:JSON.stringify({artifact,compilerProfileId:"latest-023c7ee"})})).project; await loadProjects(); $("#build-result").hidden=false; $("#build-result").innerHTML=`<strong>${esc(t("created"))}</strong><br>Program SHA-256: <code>${esc(short(artifact.programSha256,14,12))}</code><br>SilverScript: <code>${esc(artifact.compiler.upstreamCommit.slice(0,7))}</code><br><button class="primary" id="deploy-new">${esc(t("deploy"))}</button>`; $("#deploy-new").onclick=()=>deployProject(saved.id);showResult({title:t("createSuccess"),message:t("created"),details:[{label:"Will",value:saved.name},{label:"Program SHA-256",value:artifact.programSha256},{label:"SilverScript",value:artifact.compiler.upstreamCommit}],actions:[{label:t("exportWill"),className:"ghost",onClick:()=>downloadWillPackage(saved.id)},{label:t("deployNow"),onClick:()=>deployProject(saved.id)}]});
    }catch(e){showResult({ok:false,title:t("createFailed"),message:e.message});}
    finally{hideProgress();}
  });
  button.disabled=false;
}
function requestSecrets(){return new Promise((resolve,reject)=>{const d=$("#secret-dialog");$("#sign-password").value=$("#sign-payment").value="";const close=()=>{d.removeEventListener("close",close);if(d.returnValue==="confirm")resolve({walletSecret:$("#sign-password").value,paymentSecret:$("#sign-payment").value});else reject(new Error(state.language==="zh"?"已取消":"Cancelled"));};d.addEventListener("close",close);d.showModal();});}
async function deployProject(id){
  const project=state.projects.find(p=>p.id===id)||((await api(`/api/projects/${id}`)).project); if(!state.wallet)return showResult({ok:false,title:t("deployFailed"),message:t("walletNeeded"),actions:[{label:t("connectWallet"),onClick:()=>page("wallet")}]}); if(willWalletRole(project,state.wallet.address)!=="owner")return showResult({ok:false,title:t("deployFailed"),message:state.language==="zh"?"只有遗嘱建立人钱包可以部署这份草案":"Only the will creator wallet can deploy this draft"}); if(!project.artifact)return showResult({ok:false,title:t("deployFailed"),message:state.language==="zh"?"项目没有编译产物":"Project has no compiled artifact"});
  await exclusive(async()=>{
    showProgress(t("progressDeploy"));
    try{
      progressStep(t("progressDeployDraft"));const {draft}=await api("/api/deploy/draft",{method:"POST",body:JSON.stringify({projectId:project.id,network:"tn10",amountKas:project.deployAmount,address:state.wallet.address,publicKey:state.wallet.publicKey,artifact:project.artifact,source:project.source,constructorArgs:project.constructorArgs})});
      progressStep(t("progressDeployAuth"));const secrets=await requestSecrets();
      progressStep(t("progressDeploySign"));const signed=await api("/api/deploy/sign",{method:"POST",body:JSON.stringify({draftId:draft.id,walletId:state.wallet.walletId,...secrets})});
      progressStep(t("progressDeployBroadcast"));const {result}=await api("/api/deploy/broadcast",{method:"POST",body:JSON.stringify({draftId:draft.id,signedTransactionSafeJson:signed.signedTransactionSafeJson})});
      progressStep(t("progressDeploySave"));await api(`/api/projects/${project.id}`,{method:"PUT",body:JSON.stringify({deployment:{...result,network:"tn10",status:"active",activeTxid:result.txid,activeOutputIndex:0}})});await loadProjects();await refreshBalance();$("#operate-project").value=project.id;page("operate");showDeploymentResult(project.id,result);void pollKascovEvidence(result);
    }catch(e){if(!/cancel/i.test(e.message))showResult({ok:false,title:t("deployFailed"),message:e.message});}
    finally{hideProgress();}
  });
}

async function renderLifecycle(){
  const id=$("#operate-project").value;
  const card=$("#lifecycle-card");
  const requestId=++state.lifecycleRequestId;
  state.lifecycleController?.abort();
  const controller=new AbortController();
  state.lifecycleController=controller;
  if(state.activeProject?.id!==id){clearProjectScopedTransactionState(state);state.package=null;state.review=null;state.operationId="";$("#operation-review").hidden=true;renderPackageReview();}
  const exportButton=$("#export-active-will");
  const deleteButton=$("#delete-active-will");
  if(!id){state.activeProject=null;exportButton.disabled=true;deleteButton.disabled=true;renderWalletRole(null);state.countdownTargetMs=null;card.removeAttribute("aria-busy");card.innerHTML=`<div class="empty">${state.language==="zh"?"选择一个遗嘱查看链上状态。":"Select a will to inspect."}</div>`;return;}
  const project=state.projects.find(p=>p.id===id);
  state.activeProject=project;
  exportButton.disabled=!project?.artifact;
  exportButton.onclick=()=>downloadWillPackage(id);
  deleteButton.disabled=!project;
  deleteButton.onclick=()=>deleteProject(id);
  renderWalletRole(project);
  if(!project){card.removeAttribute("aria-busy");card.innerHTML=`<div class="empty">${state.language==="zh"?"找不到这份遗嘱，请刷新列表。":"This will could not be found. Refresh the list."}</div>`;return;}
  if(!project.deployment?.txid){
    const owner=willWalletRole(project,state.wallet?.address)==="owner";
    state.countdownTargetMs=null;
    card.removeAttribute("aria-busy");
    card.innerHTML=`<div class="empty">${t("notDeployed")}${owner?`<div class="button-row"><button class="primary" id="deploy-active">${t("deploy")}</button></div>`:`<p>${state.language==="zh"?"只有建立人钱包可以部署；其它钱包需等待已部署的操作包，到期后才能提取。":"Only the creator wallet can deploy. Other wallets must import a deployed package and wait for maturity before claiming."}</p>`}</div>`;
    if(owner)$("#deploy-active").onclick=()=>deployProject(id);
    return;
  }
  card.setAttribute("aria-busy","true");
  card.innerHTML=`<div class="loading-state"><span class="loading-spinner"></span><strong>${state.language==="zh"?"正在读取 Covenant 状态…":"Reading covenant state…"}</strong><small>${state.language==="zh"?"正在连接 TN10 节点，页面不会重复发起请求。":"Connecting to the TN10 node; duplicate requests are suppressed."}</small></div>`;
  try{
    const [{status},{operations}]=await Promise.all([
      api(`/api/projects/${id}/lifecycle-status`,{signal:controller.signal}),
      api(`/api/projects/${id}/operations`,{signal:controller.signal})
    ]);
    if(requestId!==state.lifecycleRequestId)return;
    const role=willWalletRole(project,state.wallet?.address);
    const visibleOperations=operationsForWillRole(operations||[],status,role);
    const label=status.status==="mature"?t("mature"):status.status==="spent"?t("spent"):t("active");
    const kcc=project.review?.templateId==="kcc20-inheritance-vault";
    state.countdownTargetMs=status.schedule?Date.now()+status.schedule.approximateRemainingSeconds*1000:null;
    state.countdownRefreshed=false;
    const noAction=!visibleOperations.length?`<div class="empty">${role==="disconnected"?t("walletNeeded"):(status.status==="spent"?(state.language==="zh"?"该遗嘱已经完成支出":"This will has already been spent"):(state.language==="zh"?"当前钱包在此状态下没有可执行操作":"The connected wallet has no action in the current state"))}</div>`:"";
    card.innerHTML=`<div class="lifecycle-main"><div class="status-orb"><strong>${esc(label)}</strong><span>${kcc?"KCC20 · TN10":"KAS · TN10"}</span></div><div class="detail-list"><div><span>Covenant ID</span><code>${esc(short(status.covenantId,12,10))}</code></div><div><span>${state.language==="zh"?"锁定 KAS":"Locked KAS"}</span><b>${esc(status.valueKas||"—")} TKAS</b></div><div><span>Outpoint</span><code>${esc(short(status.activeOutpoint?.transactionId,10,8))}:${status.activeOutpoint?.index??"—"}</code></div><div><span>${t("daysLeft")}</span><b id="lifecycle-remaining">${status.schedule?formatDuration(status.schedule.approximateRemainingSeconds):"—"}</b></div></div></div>${kcc&&status.unspent?`<div class="token-source"><label><span>${state.language==="zh"?"当前 Token 交易 ID":"Current token transaction ID"}</span><input id="operation-token-txid" placeholder="64 hex" /></label><label><span>${state.language==="zh"?"输出序号":"Output index"}</span><input id="operation-token-index" type="number" min="0" value="0" /></label><label class="wide"><span>${state.language==="zh"?"当前 Token redeem program":"Current token redeem program"}</span><textarea id="operation-token-program" rows="4" placeholder="hex"></textarea></label></div>`:""}<div class="operation-actions">${visibleOperations.map(op=>`<button class="${op.id==="inherit"?"danger":op.id==="checkIn"?"primary":"ghost"} operation" data-op="${op.id}">${esc(state.language==="zh"?op.titleZh:op.titleEn)}</button>`).join("")}</div>${noAction}${kcc&&status.unspent?`<p class="experimental-note"><span>${esc(t("kcc20Builder"))}</span></p>`:""}`;
    $$(".operation").forEach(b=>b.onclick=()=>b.dataset.op==="checkIn"?oneClickRenewal():buildOperation(b.dataset.op));
  }catch(e){
    if(e.name==="AbortError"||requestId!==state.lifecycleRequestId)return;
    state.countdownTargetMs=null;
    card.innerHTML=`<div class="empty">${esc(e.message)}</div>`;
  }finally{
    if(requestId===state.lifecycleRequestId){card.removeAttribute("aria-busy");if(state.lifecycleController===controller)state.lifecycleController=null;}
  }
}
function renderWalletRole(project){const el=$("#wallet-role"),role=willWalletRole(project,state.wallet?.address);el.className=`role-banner ${role}`;el.textContent=!project?t("roleEmpty"):t(`${role}Role`);}
// One-click check-in: build, review, authorize and broadcast in a single
// guided flow, then wait for the node to confirm the reset. The separate
// sign/broadcast buttons in the review panel stay available for other ops.
async function oneClickRenewal(){
  const project=state.activeProject;
  if(!project)return;
  if(!state.wallet)return showResult({ok:false,title:t("operationFailed"),message:t("walletNeeded"),actions:[{label:t("connectWallet"),onClick:()=>page("wallet")}]});
  await exclusive(async()=>{
    showProgress(t("checkInProgress"));
    try{
      progressStep(t("progressOperationBuild"));
      const payload=await api(`/api/projects/${encodeURIComponent(project.id)}/operations/build`,{method:"POST",body:JSON.stringify({operationId:"checkIn",feeKas:"0.01"})});
      state.package=payload.package;state.review=payload.review;state.operationId="checkIn";
      $("#operation-review").hidden=false;renderPackageReview();
      $("#operation-review").scrollIntoView({behavior:"smooth",block:"start"});
      progressStep(t("progressDeployAuth"));
      if(!confirm(t("renewalOneClickConfirm").replace("{fee}",String(payload.review?.feeKas??"0.01"))))return;
      const secrets=await requestSecrets();
      progressStep(t("progressDeploySign"));
      const signed=await api("/api/external-covenants/sign",{method:"POST",body:JSON.stringify({package:state.package,walletId:state.wallet.walletId,publicKey:state.wallet.publicKey,...secrets,confirmation:"SIGN REVIEWED EXTERNAL COVENANT",localRenewal:true})});
      state.package=signed.package;state.review=signed.review;renderPackageReview();
      progressStep(t("progressDeployBroadcast"));
      const bc=await api("/api/external-covenants/broadcast",{method:"POST",body:JSON.stringify({package:state.package,confirmation:"BROADCAST REVIEWED COVENANT",localRenewal:true})});
      await loadProjects();
      if(state.activeProject)$("#operate-project").value=state.activeProject.id;
      hideProgress();
      showResult({title:t("operationSuccess"),message:t("progressRenewalWait"),details:[{label:"TXID",value:bc.result.txid},{label:"Kascov",value:bc.result.kascovTransactionUrl,href:bc.result.kascovTransactionUrl}],actions:[{label:t("openKascov"),onClick:()=>openUrl(bc.result.kascovTransactionUrl)}]});
      if(state.activeProject)void awaitRenewalConfirmation(state.activeProject.id);
    }catch(e){
      if(!/cancel/i.test(e.message))showResult({ok:false,title:t("operationFailed"),message:e.message});
    }finally{hideProgress();}
  });
}
async function buildOperation(operationId){ const project=state.activeProject;if(!project)return;await exclusive(async()=>{const kcc=project.review?.templateId==="kcc20-inheritance-vault"&&operationId!=="checkIn";const operation={operationId,feeKas:kcc?"0.02":"0.01"};if(kcc)Object.assign(operation,{tokenTransactionId:$("#operation-token-txid")?.value.trim(),tokenOutputIndex:Number($("#operation-token-index")?.value||0),tokenProgramHex:$("#operation-token-program")?.value.trim()});showProgress(t("progressOperation"));progressStep(t("progressOperationBuild"));try{const payload=await api(`/api/projects/${project.id}/operations/build`,{method:"POST",body:JSON.stringify(operation)});state.package=payload.package;state.review=payload.review;state.operationId=operationId;$("#operation-review").hidden=false;renderPackageReview();$("#operation-review").scrollIntoView({behavior:"smooth",block:"start"});toast(operationId==="inherit"?t("claimReady"):t("packageReady"));}catch(e){showResult({ok:false,title:t("operationFailed"),message:e.message});}finally{hideProgress();}}); }

function packageTokenStates(){const inputs=state.package?.covenantInputs||[];const token=inputs.find(input=>input.entrypoint==="__leader_transfer");const states=token?.arguments?.find(argument=>argument.kind==="state[]")?.items||[];if(!states.length)return"";return`<h4>KCC20 state outputs</h4><ol class="output-list">${states.map((item,index)=>`<li>#${index} · ${esc(item.fields?.amount?.data||"—")} token → ${esc(short(item.fields?.ownerIdentifier?.hex,10,8))} · type ${esc(item.fields?.identifierType?.data)}</li>`).join("")}</ol>`;}
function renderPackageReview(){const el=$("#package-review");if(!el)return;if(!state.review){el.className="empty";el.textContent=t("packageEmpty");$("#download-package").disabled=true;$("#sign-package").disabled=true;$("#broadcast-package").disabled=true;return;}const r=state.review;const slots=r.signatureSlots||[];el.className="";el.innerHTML=`<div class="review-grid"><div><span>Network</span><code>${esc(r.network)}</code></div><div><span>Entrypoint</span><code>${esc(r.entrypoint)}</code></div><div><span>Covenant ID</span><code title="${esc(r.covenantId)}">${esc(short(r.covenantId,10,8))}</code></div><div><span>Fee</span><code>${esc(r.feeKas)} TKAS</code></div><div><span>Inputs / outputs</span><code>${r.inputCount} / ${r.outputCount}</code></div><div><span>Signatures</span><code>${slots.filter(s=>s.signed).length}/${slots.length}</code></div><div><span>Descriptor</span><code>${esc(r.descriptorStatus)}</code></div><div><span>Commitment</span><code>${esc(short(r.commitment,10,8))}</code></div></div><h4>Covenant inputs</h4><ol class="output-list">${(r.covenantInputs||[]).map(input=>`<li>#${input.transactionInputIndex} · ${esc(input.entrypoint)} · ${esc(short(input.covenantId,10,8))} · ${esc(input.descriptorStatus)}</li>`).join("")}</ol><h4>KAS outputs</h4><ol class="output-list">${(r.outputs||[]).map(o=>`<li>#${o.index} · ${esc(o.valueKas)} TKAS → ${esc(o.address||("Covenant "+short(o.covenantId,8,6)))}</li>`).join("")}</ol>${packageTokenStates()}`;$("#download-package").disabled=false;$("#sign-package").disabled=r.complete||!slots.some((slot)=>!slot.signed);$("#broadcast-package").disabled=!r.complete;}
async function signPackage(){if(!state.package||!state.review)return;if(!state.wallet)return showResult({ok:false,title:t("operationFailed"),message:t("walletNeeded")});if(!confirm(t("confirmSign")))return;await exclusive(async()=>{showProgress(t("progressSigning"));progressStep(t("progressSigning"));try{const secrets=await requestSecrets();const payload=await api("/api/external-covenants/sign",{method:"POST",body:JSON.stringify({package:state.package,walletId:state.wallet.walletId,publicKey:state.wallet.publicKey,...secrets,confirmation:"SIGN REVIEWED EXTERNAL COVENANT",localRenewal:state.operationId==="checkIn"})});state.package=payload.package;state.review=payload.review;renderPackageReview();toast(t("signed"));}catch(e){if(!/cancel/i.test(e.message))showResult({ok:false,title:t("operationFailed"),message:e.message});}finally{hideProgress();}});}
async function downloadPackage(){if(!state.package)return;const fileName=`kas-will-${String(state.review?.commitment||"package").slice(0,12)}.ssinvite`;const saved=await saveTextFile(JSON.stringify(state.package,null,2),fileName);if(saved===null)toast(t("exportCancelled"),"bad");else toast(`${t("packageSaved")}: ${saved}`);}

async function buildTransfer(){
  if(!state.wallet)return toast(t("walletNeeded"),"bad");
  const recipient=$("#send-recipient").value.trim();
  const amount=$("#send-amount").value.trim();
  if(!recipient||!amount)return toast(state.language==="zh"?"请填写收款地址和金额":"Enter a recipient and an amount","bad");
  await exclusive(async()=>{
    showProgress(t("buildTransfer"));progressStep(t("progressOperationBuild"));
    try{
      const {draft}=await api("/api/wallets/transfer/draft",{method:"POST",body:JSON.stringify({network:"tn10",address:state.wallet.address,recipient,amountKas:amount})});
      state.transferDraft=draft;
      const review=$("#transfer-review");review.hidden=false;
      review.innerHTML=`<strong>${esc(t("transferBuilt"))}</strong><br>${state.language==="zh"?"收款":"To"}: <code>${esc(short(recipient,14,10))}</code><br>${state.language==="zh"?"金额":"Amount"}: <b>${esc(draft.amountKas)} TKAS</b> · ${state.language==="zh"?"手续费":"Fee"}: <b>${esc(draft.feeKas)} TKAS</b><br>Commitment: <code>${esc(short(draft.commitment,12,8))}</code> · ${state.language==="zh"?"本地预检":"Local preflight"}: ${esc(draft.preflight?.verdict||"—")}`;
      $("#send-transfer").disabled=false;
    }catch(e){showResult({ok:false,title:t("sendFailed"),message:e.message});}
    finally{hideProgress();}
  });
}
async function sendTransfer(){
  if(!state.transferDraft||!state.wallet)return;
  if(!confirm(t("transferSendConfirm")))return;
  await exclusive(async()=>{
    showProgress(t("confirmSend"));progressStep(t("progressDeploySign"));
    try{
      const secrets=await requestSecrets();
      progressStep(t("progressBroadcast"));
      const {result}=await api("/api/wallets/transfer/send",{method:"POST",body:JSON.stringify({draftId:state.transferDraft.id,walletId:state.wallet.walletId,...secrets})});
      state.transferDraft=null;$("#send-transfer").disabled=true;
      const review=$("#transfer-review");review.hidden=true;
      $("#send-recipient").value="";$("#send-amount").value="";
      await refreshBalance();
      showResult({title:t("transferSent"),details:[{label:"TXID",value:result.txid},{label:"Kascov",value:result.kascovTransactionUrl,href:result.kascovTransactionUrl},{label:state.language==="zh"?"金额":"Amount",value:`${result.amountKas} TKAS`},{label:state.language==="zh"?"手续费":"Fee",value:`${result.feeKas} TKAS`}]});
    }catch(e){if(!/cancel/i.test(e.message))showResult({ok:false,title:t("sendFailed"),message:e.message});}
    finally{hideProgress();}
  });
}

async function loadKcc20Tokens(){
  if(!state.wallet){state.kcc20Tokens=[];renderKcc20Tokens();return;}
  try{
    const {tokens}=await api(`/api/kcc20/wallet/tokens?address=${encodeURIComponent(state.wallet.address)}`);
    state.kcc20Tokens=tokens||[];
  }catch{state.kcc20Tokens=state.kcc20Tokens||[];}
  renderKcc20Tokens();
}
function renderKcc20Tokens(){
  const list=$("#kcc20-token-list");if(!list)return;
  if(!state.kcc20Tokens.length){list.innerHTML=`<div class="empty">${esc(t("kcc20Empty"))}</div>`;renderKcc20TokenSelect();return;}
  list.innerHTML=state.kcc20Tokens.map((token)=>`<div class="kcc20-token"><div><b>${esc(token.name||token.ticker||short(token.covenantId,10,8))}</b><small>${esc(token.covenantId)}</small></div><span class="balance">${token.holdings?.balance==null?esc(t("kcc20BalanceUnknown")):esc(token.holdings.balance)}</span><button class="remove-token" data-id="${esc(token.covenantId)}">${esc(t("kcc20Remove"))}</button></div>`).join("");
  $$(".remove-token").forEach((button)=>button.onclick=async()=>{
    if(!confirm(t("kcc20RemoveConfirm")))return;
    try{await api(`/api/kcc20/wallet/tokens/${encodeURIComponent(button.dataset.id)}`,{method:"DELETE",body:"{}"});await loadKcc20Tokens();}
    catch(e){toast(e.message,"bad");}
  });
  renderKcc20TokenSelect();
  renderKcc20RegisteredSelect();
}
function renderKcc20TokenSelect(){
  const select=$("#kcc20-send-token");if(!select)return;
  const selected=select.value;
  select.innerHTML=state.kcc20Tokens.length
    ?state.kcc20Tokens.map((token)=>`<option value="${esc(token.covenantId)}">${esc(token.name||token.ticker||short(token.covenantId,10,8))}${token.holdings?.balance!=null?` · ${esc(token.holdings.balance)}`:""}</option>`).join("")
    :`<option value="">—</option>`;
  if(state.kcc20Tokens.some((token)=>token.covenantId===selected))select.value=selected;
}
function renderKcc20RegisteredSelect(){
  const select=$("#kcc20-registered-select");if(!select)return;
  const selected=select.value;
  select.innerHTML=`<option value="">${esc(t("kcc20PickManual"))}</option>`+state.kcc20Tokens.map((token)=>`<option value="${esc(token.covenantId)}">${esc(token.name||token.ticker||short(token.covenantId,10,8))}</option>`).join("");
  if(state.kcc20Tokens.some((token)=>token.covenantId===selected))select.value=selected;
}
function useRegisteredKcc20Token(){
  const covenantId=$("#kcc20-registered-select").value;
  if(!covenantId)return;
  const token=state.kcc20Tokens.find((item)=>item.covenantId===covenantId);
  if(!token)return;
  $("#token-covid").value=token.covenantId;
  $("#token-template-hash").value=token.templateHash||"";
  $("#token-prefix").value=String(token.prefixLength??"");
  $("#token-suffix").value=String(token.suffixLength??"");
  state.tokenMetadata=null;
  void lookupTokenMetadata(true);
}
async function registerKcc20Token(){
  await exclusive(async()=>{
    showProgress(t("kcc20Register"));progressStep(t("kcc20Register"));
    try{
      const {token}=await api("/api/kcc20/wallet/tokens",{method:"POST",body:JSON.stringify({descriptor:$("#kcc20-descriptor").value,programHex:$("#kcc20-program").value.trim()})});
      $("#kcc20-descriptor").value="";$("#kcc20-program").value="";
      $(".kcc20-register")?.removeAttribute("open");
      toast(`${t("kcc20Registered")}: ${token.name||token.ticker||short(token.covenantId,10,8)}`);
      await loadKcc20Tokens();
    }catch(e){showResult({ok:false,title:t("operationFailed"),message:e.message});}
    finally{hideProgress();}
  });
}
async function buildKcc20Transfer(){
  if(!state.wallet)return toast(t("walletNeeded"),"bad");
  const covenantId=$("#kcc20-send-token").value;
  if(!covenantId)return toast(state.language==="zh"?"请先登记并选择代币":"Register and select a token first","bad");
  const amount=$("#kcc20-send-amount").value.trim();
  const recipient=$("#kcc20-send-recipient").value.trim();
  if(!amount||!recipient)return toast(state.language==="zh"?"请填写数量和收款地址":"Enter an amount and a recipient","bad");
  await exclusive(async()=>{
    showProgress(t("buildTransfer"));progressStep(t("progressOperationBuild"));
    try{
      const payload=await api("/api/kcc20/wallet/transfer/build",{method:"POST",body:JSON.stringify({address:state.wallet.address,publicKey:state.wallet.publicKey,covenantId,recipientAddress:recipient,amount})});
      state.kcc20Package=payload.package;state.kcc20Review=payload.review;
      const transfer=payload.transfer;
      const review=$("#kcc20-review");review.hidden=false;
      review.innerHTML=`<strong>${esc(t("kcc20TransferBuilt"))}</strong><br>${esc(transfer.name||transfer.ticker||"KCC20")}: <b>${esc(transfer.amount)}</b> → <code>${esc(short(recipient,12,9))}</code><br>${state.language==="zh"?"手续费":"Fee"}: <b>${esc(payload.review.feeKas)} TKAS</b> · ${state.language==="zh"?"本地预检":"Local preflight"}: ${esc(payload.preflight?.verdict||"—")}`;
      $("#kcc20-sign").disabled=false;$("#kcc20-broadcast").disabled=true;
    }catch(e){showResult({ok:false,title:t("operationFailed"),message:e.message});}
    finally{hideProgress();}
  });
}
async function signKcc20Transfer(){
  if(!state.kcc20Package||!state.kcc20Review)return;
  if(!state.wallet)return toast(t("walletNeeded"),"bad");
  await exclusive(async()=>{
    showProgress(t("progressSigning"));
    try{
      const secrets=await requestSecrets();
      const payload=await api("/api/external-covenants/sign",{method:"POST",body:JSON.stringify({package:state.kcc20Package,walletId:state.wallet.walletId,publicKey:state.wallet.publicKey,...secrets,confirmation:"SIGN REVIEWED EXTERNAL COVENANT"})});
      state.kcc20Package=payload.package;state.kcc20Review=payload.review;
      $("#kcc20-broadcast").disabled=!payload.review.complete;
      toast(t("signed"));
    }catch(e){if(!/cancel/i.test(e.message))showResult({ok:false,title:t("operationFailed"),message:e.message});}
    finally{hideProgress();}
  });
}
async function broadcastKcc20Transfer(){
  if(!state.kcc20Package||!state.kcc20Review?.complete)return;
  if(!confirm(t("transferSendConfirm")))return;
  await exclusive(async()=>{
    showProgress(t("progressBroadcast"));progressStep(t("progressBroadcast"));
    try{
      const payload=await api("/api/external-covenants/broadcast",{method:"POST",body:JSON.stringify({package:state.kcc20Package,confirmation:"BROADCAST REVIEWED COVENANT"})});
      const result=payload.result;
      state.kcc20Package=null;state.kcc20Review=null;
      $("#kcc20-sign").disabled=true;$("#kcc20-broadcast").disabled=true;
      const review=$("#kcc20-review");review.hidden=true;
      $("#kcc20-send-amount").value="";
      await Promise.all([refreshBalance(),loadKcc20Tokens()]);
      showResult({title:t("kcc20TransferSent"),details:[{label:"TXID",value:result.txid},{label:"Kascov",value:result.kascovTransactionUrl,href:result.kascovTransactionUrl}]});
    }catch(e){showResult({ok:false,title:t("operationFailed"),message:e.message});}
    finally{hideProgress();}
  });
}
async function awaitRenewalConfirmation(projectId){
  const requestId=++state.lifecycleRequestId;
  state.lifecycleController?.abort();
  const controller=new AbortController();
  state.lifecycleController=controller;
  state.countdownTargetMs=null;
  const card=$("#lifecycle-card");
  if(card){
    card.setAttribute("aria-busy","true");
    card.innerHTML=`<div class="loading-state"><span class="loading-spinner"></span><strong>${esc(t("progressRenewalWait"))}</strong><small>${esc(t("renewalWaitHelp"))}</small></div>`;
  }
  const started=Date.now();
  showProgress(t("renewalTitle"));
  try{
    while(Date.now()-started<300_000){
      const elapsed=Math.floor((Date.now()-started)/1000);
      progressStep(`${state.language==="zh"?"已等待":"waiting"} ${elapsed}s`);
      await new Promise((resolve)=>setTimeout(resolve,elapsed<30?1500:3000));
      if(requestId!==state.lifecycleRequestId)return;
      try{
        const {status}=await api(`/api/projects/${encodeURIComponent(projectId)}/lifecycle-status`,{signal:controller.signal});
        if(requestId!==state.lifecycleRequestId)return;
        const actual=Number(status?.schedule?.approximateActualSeconds||0);
        const remaining=Number(status?.schedule?.approximateRemainingSeconds||0);
        if(status?.status==="active"&&actual>0&&remaining>=actual*0.9){
          await renderLifecycle();
          toast(t("renewalConfirmed"));
          return;
        }
      }catch(e){
        if(e.name==="AbortError"||requestId!==state.lifecycleRequestId)return;
      }
    }
    if(requestId===state.lifecycleRequestId){
      await renderLifecycle();
      toast(t("renewalStillWaiting"),"bad");
    }
  }finally{hideProgress();}
}
async function broadcastPackage(){
  if(!state.package||!state.review?.complete)return;
  if(!confirm(state.language==="zh"?"确认已核对交易的网络、Covenant ID、手续费和全部输入输出，并立即广播？":"Confirm that you reviewed the network, Covenant ID, fee and every input/output, then broadcast now?"))return;
  await exclusive(async()=>{
    showProgress(t("progressBroadcast"));progressStep(t("progressBroadcast"));
    try{
      const operationId=state.operationId;
      const payload=await api("/api/external-covenants/broadcast",{method:"POST",body:JSON.stringify({package:state.package,confirmation:"BROADCAST REVIEWED COVENANT",localRenewal:operationId==="checkIn"})});
      const result=payload.result;
      await loadProjects();
      const renewedProject=operationId==="checkIn"?state.activeProject:null;
      if(state.activeProject)$("#operate-project").value=state.activeProject.id;
      hideProgress();
      showResult({title:t("operationSuccess"),message:operationId==="inherit"?(state.language==="zh"?"继承分配交易已提交，资产将严格发送到遗嘱固定的继承地址。":"The distribution transaction was submitted; assets remain bound to the fixed inheritor addresses."):t("broadcasted"),details:[{label:"TXID",value:result.txid},{label:"Kascov",value:result.kascovTransactionUrl,href:result.kascovTransactionUrl}],actions:[{label:t("openKascov"),onClick:()=>openUrl(result.kascovTransactionUrl)}]});
      // A renewal only resets the timer once the node indexes the new cell;
      // poll until the schedule actually restarts so the countdown is correct.
      if(renewedProject)void awaitRenewalConfirmation(renewedProject.id);
      else if(state.activeProject)await renderLifecycle();
    }catch(e){showResult({ok:false,title:t("operationFailed"),message:e.message});}
    finally{hideProgress();}
  });
}

async function init(){
  applyLanguage();renderHeirs();startCountdownTicker();const session=await waitForApi();state.token=session.token;state.config=await api("/api/config");state.settings=(await api("/api/settings")).settings;state.templates=(await api("/api/templates")).templates||[];$("#app-version").textContent=`Kas Will v${state.config.appVersion}`;$("#compiler-pill").textContent=`SilverScript ${String(state.config.compiler.upstreamCommit).slice(0,7)} · TN10`;renderNodeSettings();await Promise.all([loadWallets(),loadProjects(),refreshNode()]);renderWallet();setInterval(refreshNode,30000);
}

$$("[data-page]").forEach(el=>el.onclick=()=>page(el.dataset.page));$$("[data-page-link]").forEach(el=>el.onclick=()=>page(el.dataset.pageLink));$("#lang-toggle").onclick=()=>{state.language=state.language==="zh"?"en":"zh";localStorage.setItem("kas-will-language",state.language);applyLanguage();page($$(".nav.active")[0]?.dataset.page||"home");};$$(".segment").forEach(el=>el.onclick=()=>selectAsset(el.dataset.asset));$("#add-heir").onclick=addHeir;$("#parse-descriptor").onclick=parseDescriptor;$("#lookup-token").onclick=()=>lookupTokenMetadata(false);$("#will-form").onsubmit=createWill;$("#refresh-projects").onclick=loadProjects;$("#operate-project").onchange=renderLifecycle;$("#will-package-file").onchange=(event)=>importWillPackage(event.target.files?.[0]);$("#unlock-wallet").onclick=unlockWallet;$("#create-wallet").onclick=createWallet;$("#refresh-balance").onclick=refreshBalance;$("#disconnect-wallet").onclick=disconnectWallet;$("#build-transfer").onclick=buildTransfer;$("#send-transfer").onclick=sendTransfer;$("#kcc20-registered-select").onchange=useRegisteredKcc20Token;
$("#kcc20-register").onclick=registerKcc20Token;$("#kcc20-refresh").onclick=()=>void loadKcc20Tokens();$("#kcc20-build").onclick=buildKcc20Transfer;$("#kcc20-sign").onclick=signKcc20Transfer;$("#kcc20-broadcast").onclick=broadcastKcc20Transfer;$("#test-tn10-node").onclick=()=>testNode("tn10");$("#test-mainnet-node").onclick=()=>testNode("mainnet");$("#auto-tn10-node").onclick=()=>useAutomaticNode("tn10");$("#auto-mainnet-node").onclick=()=>useAutomaticNode("mainnet");$("#save-node-settings").onclick=saveNodeSettings;$("#mnemonic-check").onchange=(e)=>$("#mnemonic-close").disabled=!e.target.checked;$("#sign-package").onclick=signPackage;$("#download-package").onclick=downloadPackage;$("#broadcast-package").onclick=broadcastPackage;

init().catch((error)=>toast(error.message,"bad"));

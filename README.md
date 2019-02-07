
# ledgeraccounting

![Current Account Balances Report](Screenshots/CurrentAccountBalances.png?raw=true)

### Features:

- Beta website is hosted at: https://www.ledgeraccounting.org/
- Offers full **double-entry accounting** ledger functionality through a single-page web app. Transactions can have dates, check numbers, payees, memos, and transaction splits. Transaction splits can have accounts, amounts, and memos associated with them. Memos may be enabled via the button in the upper-right corner of the transaction editor grid. New transactions or transaction splits can be created by double-clicking a blank area within the editor grid.
- Offers web UI for generating **balance reports** (account summary), **register reports** (transaction-level detail), and **budget reports** (using zero-sum budgeting approach, a.k.a. **Envelope budgeting**).  All reports use **hledger** (http://hledger.org/) behind the scenes and then translate the resulting reports to the web UI for browsing by the user.
- Supports double-click linking of any summary amount in a balance report (account summary) to a register report (transaction-level) that shows the underlying transactions that add up to the summary balance. For example, if you are looking at an Income and Expenses monthly report and see that during a particular month, the amount of money spent on food was higher than you expected, you can easily double-click on the amount to see a breakdown of all the transactions (payees and amounts) associated with those transactions and see why the amount was higher than you would expect.
- Export of reports in PDF or CSV formats from the web UI.
- Offers **OFX/QFX import** from file or using **OFX direct connect** to your banking institution (requires manual setup of OFX direct connect with most banks, also commonly known as "Quicken Direct Connect" or "Quickbooks Direct Connect").
- Implements a full, personal finance budgeting system based upon zero-sum budgeting (also known as envelope budgeting). Dollar amounts may be "transferred" between envelopes using the web UI. Income automatically shows up in income "envelopes" and may then be distributed to expense "envelopes". Current balance of each envelope can be accessed from the web GUI at any time. Double-clicking on any balance column in a budget report links to a transaction-level report that shows the underlying transactions.
- Most report settings can be saved by saving the URL of the report either using a browser bookmark or by copy-and-pasting the URL.
- All ledger and OFX direct connect data is stored **encrypted at rest** using the user's password as a key.
- All ledger data is stored as a plain text file in a format that is easy for humans to read and also easy for machines to read and write. This allows for easy data import and export. For more details about the data format see the hledger documentation (http://hledger.org/journal.html) or the following website which explains the rationale behind plain text accounting: https://plaintextaccounting.org/
- A beta server is provided at https://www.ledgeraccounting.org/ but users must keep in mind that the complexity of their password will help protect the security of their data, in the long run. Also, this means that losing a password means that the ledger data is forever unrecoverable. Please regularly backup your ledger files offline, in a secure location. Even the server administrators cannot restore a lost ledger file, due to a forgotten password! Don't even ask! If you forget your password, just create a new account and import your last saved backup of your ledger file and write me an email, asking me to delete your old account data from the server storage area on Amazon.
- **Please note that regardless of whether the beta website at https://www.ledgeraccounting.org/ is able to remain free forever, I will NEVER EVER show advertisements, include third-party tracking scripts, or include any third-party scripts that may violate the privacy and security of the users on this site. I may change the pricing model to begin charging a small fee for users with a large number of transactions stored on ther website ($2-$5 per month) or I may solicit donations via the website (not via email) but I will never host third-party ads.**

### Credits

Huge credit goes to Simon Michael and his team at hledger. Ledgeraccounting is built on top of hledger and could not exist without it. Hopefully ledgeraccounting can more fully support the more advanced features of hledger as time goes on and can actually be depended upon by people who want to track their finances encrypted in the cloud.

### Behind the scenes:

- Leverages Amazon Cognito for authentication and AWS S3 for storage of encrypted ledgers. Ledgers are encrypted using elliptic curve cryptography (NACL: https://github.com/dchest/tweetnacl-js) and using the user's password as a key, after being run through 10,000 iterations of the PBKDF2 hash. Because of this, any accounts where the password is lost, also lose access to the full contents of the ledger. Forever. Server administrators cannot recover lost passwords or lost ledger data. Users must be encouraged to backup ledgers offline.
- Supports import of existing ledgers from hledger/ledger-cli/beancount users using the "Edit Text-based Ledger" button in the ledger editor, assuming the imported ledgers only consist of simple transactions with splits. It also supports comments with the ";" symbol but will not support comment blocks with the "comment" directive. The internal ledger parser does not currently support any directives such as "account", "alias", "include", or "P" (price of commodity) although it does allow @ to be included in a transaction posting amount to show the exchange of one commodity for another. It does not have any support for hledger's periodic transactions or automated postings (transaction modifiers).
- Supports being run from Docker or Amazon Lambda, for scalable deployment.
- Beta website server is running at https://www.ledgeraccounting.org/ but usage of this website may become limited if the AWS bills become too expensive for me to give away the service for free. Also, I may change the availability of the service if the service becomes popular enough and users want me to spend more time developing new features. In this case, small ledgers will probably remain free for users demoing the service but ledgers files larger than a certain size may require a paid subscription for a reasonable fee (probably $2-$5 per month). During the beta, it will all be offered for free. Since this is currently a side project of mine, the free beta will only expire if the platform becomes popular enough to generate revenue to fund a part-time development effort or if the AWS bills become too expensive. Alternatively, I may setup a donation page to allow users to help pay for server costs. In order to control my costs, I may also have to switch the free beta API server to a lower-tier Lambda instance that will perform much slower for users who try to upload large ledger files but will still perform well for users who keep their ledger files relatively small. As mentioned above, I will never host ads, tracking scripts, or any third-party Javascript-based methods of monetization.

### Security:

- Data and application security are both taken very seriously! Please report all suspected security problems to me via email so that I can confirm whether they are critical enough to warrant expedited patching or whether they can be filed in the github issue tracker for public disclosure, prior to being fixed.
- Due to the server-side nature of how the underlying hledger program is invoked, the non-encrypted versions of the ledgers are briefly processed within the server-side memory, while reports are being run. The non-encrypted ledgers are never stored in any disk files, although the server will try to cache encrypted ledgers on the disk to reduce the number of calls to Amazon S3. Similarly, OFX imported files and OFX direct connect authentication metadata may be stored in Amazon S3 in an encrypted form but then will be sent to the server through a POST request in an non-encrypted form (but protected by SSL's encryption layer, of course) for in-transit processing by the underlying Python code. They will never be stored long-term non-encrypted on the server's hard disk and they are discarded as soon as the request is processed, thanks to Python local variable scoping and the sandboxing provided by AWS Lambda.
- AWS S3 policies are used to only allow users who created a particular file on the AWS S3 service to access that file. This keeps users from accessing the encrypted ledgers of other users.
- Don't fully trust the security measures implemented within this service until it has been vetted by security professionals who are willing to review the code! Fortunately, the higher-risk server-side Python code is very short (~500 lines) compared to the lower-risk client-side Javascript code (currently +3000 lines). For a full security audit, all code must be reviewed, since there is a remote possibility that even the client-side code could contain cross-site scripting or cross-site request forgery vulnerabilities. Also, a very paranoid user may want to have the hledger Haskell code reviewed for possible bad-input bugs that would allow an attacker to craft a malicious hledger file and send it to the server for hledger to interpret. Amazon Lambda has provided sandboxing for individual calls to the API so this risk should be minimal, assuming the Amazon Lambda sandbox is secure.
- Risk of cross-site request forgery vulnerabilities are minimal since neither cookies nor local storage are used by this application. All authentication tokens are stored within the Angular JS application memory and are sent along with the API calls that require them.
- Risk of cross-site scripting vulnerabilities are minimal since each user's data is separated from other user's data. No user should be able to inject data that would be loaded by another user.
- Risk of Javascript code CDN compromise vulnerabilities does exist but may be mitigated in the future by downloading static copies of Javascript libraries and serving them ourselves (at the cost of increased server bandwidth usage). Regardless, Javascript libraries may be found to be vulnerable and we need to keep relatively up-to-date with them to keep this risk low. We will never include third-party Javascript meant for monetization such as advertisements, tracking, or cryptocurrency mining.
- Risk of sandbox-escape vulnerabilities within the Amazon cloud are real, due to the recent discovery of the meltdown and spectre speculation-class of attacks on Intel and AMD CPUs. Unfortunately, we have very little control on how Amazon mitigates this risk. Fortunately, if sandbox-escape vulnerabilities become a problem within the Amazon cloud, there are many larger corporations such as banks and other financial data companies that run on the Amazon cloud who will be targeted for attack long before we would be targeted. It is likely that Amazon is taking these risks very seriously and for now, we will trust them to protect the integrity of our server-side code and server-side data.
- I have been careful to keep non-encrypted encryption keys and non-encrypted ledgers out of disk files and to encrypt the keys using the PBKDF2 hash of the user's password. Unfortunately, the encrypted data is then stored on the AWS S3 servers which can be hacked and insecure passwords can be reversed through brute-forcing, given enough time. Also, evil server administrators can access the encrypted files within the Amazon S3 bucket and brute-force insecure passwords or replace copies of the server code with evil copies of the server code that send user's ledgers and OFX direct connect bank passwords to him for exploitation. I personally run the beta server (https://www.ledgeraccounting.org/) under an Amazon account with a complex password and protected with 2-factor authentication (TOTP) in order to protect user's data from hackers. If you try using a third-party server running ledgeraccounting software though, please keep in mind that other server administrators may not be quite so careful.

### Todo:

- Auto-sort ledger by date when new transactions are added (using hledger print).
- Properly implement renewing authentication tokens from Amazon Cognito. Currently, users may be forced to re-login when an authentication token expires after an hour or so.
- Auto-detect when the user is importing their first OFX file and offer to add an "auto-balancing" transaction instead of complaining that the imported transactions don't add up to the account balance encoded within the OFX file.
- Implement double-click linking between individual transactions in a register report and the actual editable ledger entry.
- Better implement multi-currency/multi-commodity support such as the "P" (price) directive. Currently, the underlying hledger program fully supports multi-currency accounting and reporting but ledgeraccounting may have lost some of this capability since I only use it for reporting on US dollars in my testing. Also, the budgeting UI will automatically add a US dollar sign to any amount so in the future, I hope to make the budgeting currency symbol user-configurable.
- Implement 2-factor authentication (TOTP) offered by Amazon Cognito.
- Support pivot reports from the UI, including pivot reports on payees and on arbitrary tags.
- Add graph-based reporting.
- Improve UI look-and-feel.
- Implement in-GUI documentation or in-product tour functionality.
- Document how to deploy the entire service from scratch, just in case somebody wants to setup a personal instance of this service. Currently the docker approach can be deployed without too much extra work (the user must compile version 1.9.1 of hledger and must setup Amazon Cognito and Amazon S3 -- or write me an email and ask politely to use my Amazon Cognito user pool and Amazon S3 buckets). Unfortunately, the Amazon Lambda approach requires quite a few more manual steps to setup.

### Screenshots:

#### Current Account Balances Report
![Current Account Balances Report](Screenshots/CurrentAccountBalances.png?raw=true)

#### Ledger Transaction Editor
![Ledger Transaction Editor](Screenshots/LedgerEditor.png?raw=true)

#### Ledger Transaction Editor with Open Split
![Ledger Transaction Editor with Open Split](Screenshots/LedgerEditorOpenSplit.png?raw=true)

#### Categorizing a Transaction (assigning it to an expense account)
![Categorizing a Transaction](Screenshots/CategorizingTransaction.png?raw=true)

#### Account Manager (for managing OFX/QFX import for Asset and Liability accounts)
![Account Manager](Screenshots/AccountManager.png?raw=true)

#### Budget Manager / Budget Report Page
![Budget Manager](Screenshots/BudgetManager.png?raw=true)

#### Income and Expenses by Month Report
![Income and Expenses by Month Report](Screenshots/IncomeAndExpensesByMonth.png?raw=true)

#### Asset Summary by Month Report
![Asset Summary by Month Report](Screenshots/AssetSummaryByMonth.png?raw=true)

#### Checking Account Register Report
![Checking Account Register Report](Screenshots/CheckingAccountRegisterReport.png?raw=true)




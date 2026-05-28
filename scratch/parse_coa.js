const fs = require('fs');

const text = `1 0 00 000	CURRENT ASSETS
1 1 00 000	CASH, BANK & OTHER
1 1 10 000	CASH
1 1 10 010	House Bank - General Cashier
1 1 10 020	Petty Cash
1 1 10 030	Cash Clearance
1 1 10 040	Cash Outlet
1 1 20 000	BANK
1 1 20 010	BANK BCA
1 1 20 020	BANK BRI
1 1 20 030	BANK Mandiri
1 1 20 040	BANK BCA PC
1 2 00 000	ACCOUNT RECEIVABLE
1 2 10 000	CLEARANCE
1 2 10 010	AR Clearance
1 2 10 020	Guest Ledger
1 2 10 030	Down Payment
1 2 20 000	CITY LEDGER
1 2 20 010	AR - Credit Card
1 2 20 020	AR - Debit Card
1 2 20 030	AR - Transfer bank
1 2 20 040	AR - QR Mandiri
1 2 20 050	AR - EDC Mandiri
1 2 20 060	AR - Complimentary
1 2 20 070	AR - Other
1 2 30 000	OTHER RECEIVABLE
1 2 30 010	AR - Employe Loan
1 3 00 000	INVENTORIES
1 3 10 000	INV. KOH RAW MATERIAL
1 3 10 010	Inv - KOH Perishable
1 3 10 020	Inv - KOH Dairy & Egg
1 3 10 030	Inv - KOH Dry Store
1 3 10 040	Inv - KOH Sauce, Syrup & Condiment
1 3 10 050	Inv - KOH Frozen
1 3 10 060	Inv - KOH Traditional Cake, Bakery, Pastry & Lite Bite
1 3 20 000	INV. KOH WORK IN PROCESS
1 3 20 010	Inv - KOH WIP
1 3 30 000	INV. FOH RAW MATERIAL
1 3 30 010	Inv - FOH Perishable
1 3 30 020	Inv - FOH Dairy & Egg
1 3 30 030	Inv - FOH Dry Store
1 3 30 040	Inv - FOH Sauce, Syrup & Condiment
1 3 40 000	INV. FOH RTD INVENTORIES
1 3 40 010	Inv - FOH RTD
1 3 50 000	INV. FOH WORK IN PROCESS
1 3 50 010	Inv - FOH WIP
1 3 60 000	INV. STORAGE
1 3 60 010	Inv - ST Dry Store
1 3 60 020	Inv - ST Sauce, Syrup & Condiment
1 3 60 030	Inv - ST Frozen
1 4 00 000	PREPAID EXPENSES
1 4 10 000	PREPAID EXPENSES (-)
1 4 10 010	Building & Fire Insurance
1 4 10 020	Payroll & Related Expenses (*)
1 4 10 030	System Subscribe
1 4 10 040	Equipment & Machine Insurance
1 4 10 050	Rent & Occupancy Expense
1 4 10 060	Consultant Fee
1 4 10 070	Prepaid Taxes (*)
1 4 10 080	Miscellaneous Prepaid Expenses
1 5 00 000	OTHERS CURRENT ASSETS
1 5 10 000	OTHERS CURRENT ASSETS (-)
1 5 10 010	Barter Agreement
1 5 10 020	Deposit on Event (*)
1 5 10 030	Deposit on Purchase Contract
1 5 10 040	Travelling Expenses - Advance
1 5 10 050	Current Assets - Other
1 6 00 000	FIXED ASSETS
1 6 10 000	LAND Asset
1 6 10 010	Land
1 6 20 000	BUILDING Assets
1 6 20 010	Building
1 6 20 020	Building Improvement
1 6 30 000	FURNITURE, FIXTURE & EQUIPMENT (FFE)
1 6 30 010	Furniture
1 6 30 020	Fixture
1 6 30 030	Equipment Gol I
1 6 30 040	Equipment Gol II
1 6 60 000	OPERATING UTENSIL & EQUIPMENT
1 6 60 010	FOH Utensil
1 6 60 020	Kitchen Tool & Utensil
1 6 60 030	Back Of Office Tool
1 6 60 040	Chinaware,Glassware,Silverware
1 6 60 050	Human Capital Item
1 6 60 060	Beginning Purchase
1 7 00 000	OTHER FIXED ASSETS
1 7 10 000	OTHER FIXED ASSETS :
1 7 10 010	Other Fixed Assets - Organization Cost / Goodwill (*)
1 7 10 020	Grand Opening Expenses
1 7 10 030	Other Fixed Assets - Pre Opening Expenses
1 7 10 040	Assests In Transit
2 0 00 000	LIABILITIES
2 1 00 000	CURRENT LIABILITIES
2 1 10 000	TRADE CREDITOR
2 1 10 010	AP - Raw Material & Supplies
2 1 10 020	AP - Utility
2 1 10 030	AP - Suspense
2 1 10 040	AP - Other
2 1 20 000	TRADE TAXED
2 1 20 010	Tax - Pembangunan I (11%)
2 1 20 020	Tax - PPh 21
2 1 20 030	Tax - PPh 21 Kas Negara
2 1 30 000	TRADE OTHER
2 1 30 010	Service Charge (7%)
2 1 30 020	BPJS Ketenagakerjaan
2 1 30 030	BPJS Kesehatan
2 1 30 040	Consigment
2 1 30 050	Lost and Breakage Fund
2 1 30 060	Trade Other - Other
2 1 40 000	ACCRUED EXPENSES
2 1 40 010	A/E - Payroll & Related
2 2 00 000	LONG TERM LIABILITIES
2 2 10 000	SHORT TERM LIABILITIES
2 2 10 010	Bank Loan (Short Term)
2 2 10 020	Financial Institution (Non Bank) Loan (Short
2 2 10 030	Bank Loan (Long Term / Due in This Year)
2 2 10 040	Financial Institution Loan (Long Term / Due i
2 2 20 000	NOTES PAYABLE
2 2 20 010	Leasing Agreement
2 2 20 020	Promisory Not
2 2 20 030	Release Payment Account
2 2 30 000	LONG TERM LOAN
2 2 30 010	Bank Loan
2 2 30 020	Long Term Notes Payable
2 2 30 030	Long Term Loan - Other
3 0 00 000	CAPITAL
3 1 00 000	OTHER CAPITAL
3 1 10 000	Capital(-)
3 1 10 010	Capital Share
3 1 10 020	Retained Earning Beg. Year
3 1 10 030	Retained Earning
3 1 10 040	Retained Earning - TA
3 1 10 050	Profit & Loss Current Year
3 1 10 060	Paid Up Capital
3 1 10 070	Owner Withdrawal
3 1 10 080	Balance Forward
4 0 00 000	REVENUES
4 1 00 000	FOOD & BEVERAGE REVENUE
4 1 00 010	Food Revenue
4 1 00 020	Beverage Revenue
4 1 00 030	Traditional Cake, Bakery, Pastry & Lite Bite Revenue
4 2 00 000	OTHER REVENUES
4 2 00 010	Catering Outside
4 2 00 020	Event
4 2 00 030	Merchandise
4 2 00 040	Miscellaneous (Other)
5 0 00 000	COST OF GOODS SOLD
5 1 00 000	COGS FOOD
5 1 10 000	COST OF FOOD
5 1 10 010	Cost of Food Raw Material
5 1 10 020	Cost of WIP
5 1 10 030	Cost of Food Spoil / Waste
5 1 20 000	COST OF TRADITIONAL CAKE, BAKERY, PASTRY & LITE BITE
5 1 20 010	Cost of TBP&L Raw Material
5 1 20 020	Cost of WIP
5 2 00 000	COGS OF BEVERAGE
5 2 00 010	Cost of Bev Raw Material
5 2 00 020	Cost of Bev RTD
5 2 00 030	Cost of Bev WIP
5 2 00 040	Cost of Bev Spoil / Waste
5 3 00 000	COGS OTHER REVENUES
5 3 00 010	Cost of Catering Outside
5 3 00 020	Cost of Event
5 3 00 030	Cost of Merchandise
5 3 00 040	Cost of Miscellaneous
5 3 00 050	Cost of Variance
6 0 00 000	EXPENSES
6 1 00 000	SALARIES AND WAGES
6 1 00 010	KOH S&W
6 1 00 020	FOH S&W
6 1 00 030	Support and Marketing S&W
6 1 00 040	BOD S&W
6 1 00 050	Partners Benafit
6 2 00 000	SUPPLIES EXPENSES
6 2 00 010	Kitchen Supplies
6 2 00 020	Chemical, Cleaning and Sanitation Supplies
6 2 00 030	FOH Supplies
6 2 00 040	Packing Supplies
6 2 00 050	Office & Cashier Supplies
6 3 00 000	MARKETING EXPENSE
6 3 00 010	Marketing Production Expense
6 3 00 020	Marketing Entertainment Expense
6 3 00 030	Other Marketing Expense
6 4 00 000	PREMISES EXPENSE
6 4 00 010	Rent & Occupancy Expense
6 4 00 020	Repairs & Maintenance Expense
6 4 00 030	Cleaning, Sanitation, Security & Safety Expense
6 4 00 040	Electricity and Water
6 4 00 050	Building Tax, Other Tax, Fees & Insurance Expense
6 5 00 000	GENERAL EXPENSE
6 5 00 010	Administrative Expense
6 5 00 020	IT, System Subscribe & Software Expense
6 5 00 030	Communication and WIFI Expense
6 5 00 040	Research & Learning Development Expense
6 5 00 050	Transport & Travel Expense
6 5 00 060	Entertainment & Misc Expense
6 5 00 070	Bank Charge & MDR Expense
6 5 00 080	Other Expense
6 5 00 090	Food Cost Before Cut Off
6 5 00 100	Utility and Service Expense
7 0 00 000	FIXED CHARGE
7 1 00 000	DEPRECIATION EXPENSES
7 1 00 010	Building Assets DE
7 1 00 020	Furniture & Fixture Equipment  DE
7 1 00 030	Operating Utensil & Equipment  DE
7 1 00 040	Other DE
7 2 00 000	NON OPERATING INCOME
7 2 00 010	Interest Earning
7 2 00 020	Miscellaneous
7 3 00 000	NON OPERATING EXPENSES
7 3 00 010	Rounding
7 3 00 020	Bank Interest
7 3 00 030	Loss On Disposal Of Asset
7 3 00 040	Other Non Operating Expense`;

const lines = text.trim().split('\n');
let sql = '';
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  const parts = line.split('\t');
  if (parts.length < 2) continue;
  let code = parts[0].trim().replace(/\s+/g, '-'); // e.g. 1 1 10 010 -> 1-1-10-010
  let name = parts[1].trim().replace(/'/g, "''"); // escape quotes
  
  let type = '';
  const firstDigit = code.charAt(0);
  if (firstDigit === '1') type = 'asset';
  else if (firstDigit === '2') type = 'liability';
  else if (firstDigit === '3') type = 'equity';
  else if (firstDigit === '4') type = 'income';
  else if (firstDigit === '5') type = 'expense';
  else if (firstDigit === '6') type = 'expense';
  else if (firstDigit === '7') {
    if (code.startsWith('7-2')) type = 'income';
    else type = 'expense';
  }
  
  sql += `    (v_org_id, '${code}', '${name}', '${type}'),\n`;
}
fs.writeFileSync('c:/Users/HP/Documents/YRach/Projects/sigmaERP/bysuite-erp/scratch/coa_seed.sql', sql);

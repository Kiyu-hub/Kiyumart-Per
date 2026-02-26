$ErrorActionPreference='Stop'
$base='http://127.0.0.1:5000'
$results=@()
function AddResult($name,$pass,$detail){ $script:results += [pscustomobject]@{check=$name;pass=$pass;detail=$detail} }

try {
  $seed = Invoke-RestMethod -Method Post -Uri "$base/api/seed/test-users" -ContentType 'application/json' -Body '{}'
  AddResult 'seed_test_users' ($seed.success -eq $true) "success=$($seed.success)"
} catch { AddResult 'seed_test_users' $false $_.Exception.Message }

$superToken=$null; $buyerToken=$null
try {
  $super = Invoke-RestMethod -Method Post -Uri "$base/api/test/token" -ContentType 'application/json' -Body '{"email":"superadmin@kiyumart.com"}'
  $buyer = Invoke-RestMethod -Method Post -Uri "$base/api/test/token" -ContentType 'application/json' -Body '{"email":"buyer@kiyumart.com"}'
  $superToken=$super.token; $buyerToken=$buyer.token
  AddResult 'token_generation' ((-not [string]::IsNullOrWhiteSpace($superToken)) -and (-not [string]::IsNullOrWhiteSpace($buyerToken))) "super=$(-not [string]::IsNullOrWhiteSpace($superToken)),buyer=$(-not [string]::IsNullOrWhiteSpace($buyerToken))"
} catch { AddResult 'token_generation' $false $_.Exception.Message }

$product=$null
try {
  $products = Invoke-RestMethod -Method Get -Uri "$base/api/products"
  if ($products -and $products.Count -gt 0) { $product=$products[0]; AddResult 'product_available' $true "productId=$($product.id)" } else { AddResult 'product_available' $false 'no products' }
} catch { AddResult 'product_available' $false $_.Exception.Message }

$orderId=$null
if ($product -and $buyerToken) {
  try {
    $price=[decimal]$product.price
    $discount=[decimal]($product.discount)
    $subtotal=[math]::Round($price * (1 - ($discount/100)),2)
    $settingsHeaders=@{ Authorization = "Bearer $superToken" }
    $settings = Invoke-RestMethod -Method Get -Uri "$base/api/platform-settings" -Headers $settingsHeaders
    $feePct=[decimal]$settings.processingFeePercent
    if($feePct -le 0){$feePct=1.95}
    $proc=[math]::Round($subtotal*($feePct/100),2)
    $total=[math]::Round($subtotal+$proc,2)
    $body = @{
      sellerId = $product.sellerId
      deliveryMethod = 'rider'
      deliveryAddress = 'QA Delivery Compliance Address'
      deliveryCity = 'Accra'
      deliveryPhone = '+233500000101'
      deliveryLatitude = '5.6037000'
      deliveryLongitude = '-0.1870000'
      deliveryFee = '0.00'
      subtotal = ('{0:N2}' -f $subtotal).Replace(',','')
      processingFee = ('{0:N2}' -f $proc).Replace(',','')
      total = ('{0:N2}' -f $total).Replace(',','')
      currency='GHS'
      items = @(@{ productId = $product.id; quantity = 1 })
    } | ConvertTo-Json -Depth 6
    $orderHeaders=@{ Authorization = "Bearer $buyerToken" }
    $order = Invoke-RestMethod -Method Post -Uri "$base/api/orders" -Headers $orderHeaders -ContentType 'application/json' -Body $body
    $orderId=$order.id
    AddResult 'order_create' ($null -ne $orderId) "orderId=$orderId"
  } catch { AddResult 'order_create' $false $_.Exception.Message }
}

if ($orderId -and $superToken) {
  try {
    $h=@{ Authorization = "Bearer $superToken" }
    $hookBody = @{ orderId = $orderId } | ConvertTo-Json
    $hook = Invoke-RestMethod -Method Post -Uri "$base/api/test/payments/complete" -Headers $h -ContentType 'application/json' -Body $hookBody
    AddResult 'payment_hook_complete' ($hook.success -eq $true) "success=$($hook.success)"
  } catch { AddResult 'payment_hook_complete' $false $_.Exception.Message }
}

if ($orderId -and $buyerToken) {
  try {
    $h=@{ Authorization = "Bearer $buyerToken" }
    $orderAfter = Invoke-RestMethod -Method Get -Uri "$base/api/orders/$orderId" -Headers $h
    $status = "$($orderAfter.status)".ToLowerInvariant()
    $ok = @('searching_rider','assigned','processing','ready','confirmed') -contains $status
    AddResult 'payment_gated_searching_rider' $ok "status=$status payment=$($orderAfter.paymentStatus)"

    $eta = Invoke-RestMethod -Method Get -Uri "$base/api/orders/$orderId/eta?riderLat=5.6041&riderLng=-0.1865" -Headers $h
    $etaOk = ($eta.source -eq 'backend_math' -and $eta.etaMinutes -ne $null)
    AddResult 'backend_eta_endpoint' $etaOk "eta=$($eta.etaMinutes) source=$($eta.source)"
  } catch { AddResult 'post_payment_checks' $false $_.Exception.Message }
}

if ($superToken) {
  try {
    $h=@{ Authorization = "Bearer $superToken" }
    $health = Invoke-RestMethod -Method Get -Uri "$base/api/admin/system-health" -Headers $h
    $healthOk = ($null -ne $health.pipeline -and $null -ne $health.assignment -and $null -ne $health.tracking)
    AddResult 'system_health_endpoint' $healthOk 'has pipeline/assignment/tracking'

    $rev1 = Invoke-RestMethod -Method Get -Uri "$base/api/admin/revenue/views/summary" -Headers $h
    $rev2 = Invoke-RestMethod -Method Get -Uri "$base/api/admin/revenue/views/order-payments?limit=5" -Headers $h
    AddResult 'revenue_view_endpoints' $true "summaryRows=$($rev1.summary.Count) paymentsRows=$($rev2.rows.Count)"
  } catch { AddResult 'admin_endpoints' $false $_.Exception.Message }
}

$results | ForEach-Object { "$(if($_.pass){'PASS'}else{'FAIL'}) $($_.check) :: $($_.detail)" | Write-Output }
if(($results | Where-Object { -not $_.pass }).Count -gt 0){ exit 1 }

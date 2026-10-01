// Catálogo de presentación; no altera inventarios ni permisos.
const huellasCanal = new Set([
  "6d177811786c4d7502292d472caa00a69fbfdddce692985887a64d1c436fcd9b",
  "6321d85ba3ed30a8c29795dff2f3621329006e1d994c37696a44a375ce94ae23",
  "04f0cd5bcda27a3417d6b3ccd3002b1ae5b123f82af53a774f6844771e9ec23a",
  "e86c2d3a0765f20cc68cf28b11b588dacff0ada76497ee51b44eb404530f4270",
  "0405f517817791ba281198582f6ca98b37549b7c28f1c1363c724b39b27365d4",
  "c40fbcbf2f09400d844cce86f0a6f3b256eaf32bc6438981e5907f16e5b3707f",
  "e4bf969deac1823335a9d8a0bc290e22f9980de9a523cf1c494e22c9ee455f7b",
  "d4a0dd81d38ac7b938153f4d381d862152173f79e4fddf22cbb31d7fd05efcb5",
  "5869f4a23ac940850e72506a0548bc41784cfc55685775ba723efa20f27e179f",
  "0f05cbffdb4d8f4b6d84e739c9ec0cc6c1f99f9e68896307c28d5db5f3bb8f3b",
  "d31ecd116c97c10f512fb9906de9eba538d9aca3c792e0d4a056a95dd1c5b73c",
  "8b1fecd16cc908a24856ffff026e797978cb0cdb2ad82d8cf0e14543a9b0b45a",
  "db2b3868862aa5bc77f1d19b4eb02f2fd27637ce6c88df5a8de8675003afca26",
  "611011d95a474b95c50c5915e8aa01d13cbaed90ea4a26592c9c8be9d56072a9",
  "12046022c70667699b17869229ee968c8c913bf6f9d70c67d897d1b356fd73ca",
  "55ec155ea3c1a2d4fd86d2ec5ab8426b67e315c092706f669ab16aa1f6ae20a6",
  "69d11dad128943c4b2c8c5dd43e98f6968eba4caa509533283b3e018d70168e2",
  "de1863ff530a91acecfd56b1f791a3be54c18008b110f8659377a3b655d352fb",
  "5308d8e6eab03da5172471469818b80419d53b589a92cc8b0fc2ec7ec22c395a",
  "4848e7294ff97b1d839a72fd1078be925157bee95b7052784035696566407a85",
  "19102ec056c81d16f77c3dfc19fe34f02468d3652d44832bdae3caf223cad693",
  "7f8dbdbab1f24761a9048f1a4ed5e441877b637c1d5c429cf78858b6fa0b11a3",
  "0068d6023b0a673257940b3a80260ad001d41b45fa141520f8c67fb32767a35e",
  "077498730025744e1e5a737044fb67478b78e1bcbacd5ea23770b5d2c870ad78",
  "7c6efe76695b50bcaf88280a9df1bd93006fea2e7a5baab3c09a223301801d3b",
  "f00ff25c32b37bfc5e18486b5b786e09aed4f2bedb1ee0adf0e03e7a5acbd2c5",
  "214b98423fee034bb86fa0610a9d0f9a3509f62578f68ecd0a99067abf46b56b",
  "72bf88a6568e84801146056d90b99a49955e811f4e89ea97a5516097200c1f7b",
  "d50d1ab0b5662c529e86036eaa86e320383091c5ca289485defff29b6c0a9735",
  "e478a1c104aebd13629f1e7560677c39caeddc4f04365b1851ead47fa1728122",
  "8784d99561c00c0c877ad4ef8f20d69f0a1a8a9e7253859ec82fdaa74f49144b",
  "06c7db350f91d07ac91200cc54e96c2cc5d988e7c11f46919429e6503a269dfb",
  "db5fcd032fa4ec3a0353ee5602407c71d4a90653df9ec907995635aa51e9a041",
  "83cec367c8721a7765d39572d5c1dc40a33c51c2bdc4285eaa4f4ebcbc027651",
  "49fce6d12ca2bcdfe72b8eedaad2a8219af4035de51e32a259117a12fb12910a",
  "b461a00342e509ae70d22145ce0d21e5e8cb1dbf1beeebc75ab45d6ff0a20de5",
  "452ab585ae58cf09e97fa9bbfa3c2a7190ee1578c7f2042fd716ce12be0bb8b5",
  "be5138780b1970976876709feafb8ced172069b3ceb4e5dad526f640e624225e",
  "29eaf7789aafc412ca867ce6b4207c8c2e59998360eade6131c8fffe21508ffb",
  "eb4de778e304f0198d8efa20d6d31fe5796f548ee7711f698c9b1eec08706cc4",
  "242e7164d4b5e4c01184151a4fb1aec9a124a425d1471da904ca03a4f205cfa8",
  "6fb2fb9d0abbe8a3ee67c31064c643808c3bf77979dce41d47949e6bbc027df1",
  "cde0f449f095eabc9fd134d83cc1862cd316ca18624422028a8463930db4987d",
  "a604011d553b0c34c37532ccfa39ef7503fb85b7504557c5f5413cf03e3dde85",
  "18855e820c87640229daf46234f684b735b3855b5375b584028601175cb61cf3",
  "d2160e561f31bcfd754c6e9946dfb61f1c19c5079263d381830b3b557bb6add0",
  "7ebb906f02acc58ab6dd8628eafae14f112a526d1f73149665c74baf5eb8af2e",
  "f2a76be34f66619d812931271f6a81c64ee5271a056e5ef882767fc14d416c04",
  "481f7928b1d1dd2b1c81f7ccb3a8548bb2259d59a57dddfc7caf7e4c3bdd388d",
  "b617215424fec76c7c5913064a4c60706c4642e7d561f0d72cfc3e1a2b1f74d8",
  "702826c3eb79265797e9098922ea7456c9cfd86975bd7b830044b35d9307454a",
  "cf1783908e7cb45d0e97590343436dbca1838f8a6058a3a921b3eb630b85e97a",
  "2ff4e291d843eb0a12787a7e83ecea98a75ec1c77de107527d30d9ddf935a9cf",
  "589afaf66aa7500ba1c0afa76f377e13465ce4fc4447a4413fc5950bde4d7c17",
  "2caea13ebfd732a11f27d698275710d574a03e494290506f633e33eed55f3082",
  "3e9d265492eddc348cc764de4ae48954347160e00b8f1a36bae2dcfdbe855cd9",
  "0a66633fb4e155384872d0e56e46f9f1bf481d65124e89bfdd0fa53fe31c9a32"
])
const huellasReferencia = new Set([
  "03fd80517c58153a3a995de990525e2ff75c629582edfb1e7a3f165df5fad4ca",
  "04b5389d391e094fd005849dd1ea97e0ed46bf07f5dca1aecafe06421a38664e",
  "057216a45da986fa3fdd0f0fee007da65fbac30844139ab141340a56f5308a9d",
  "08eaf8cd7d81569b27541e17112c3dd2651fc06b8283fffed198a62fe7970e8a",
  "0a5d56a0143163d35f5ac67aeda86c3fb871ca311910c5fbc962b2cce372d855",
  "117bd4f983282b9fe6c3f0e8e71796744d90b6197f7ea118fa6e625b8e637a08",
  "1354497257bbe1cf1ddbab831af85f96d2b3b7c9f396d52c2b59204763d95fbe",
  "155ce29084a185d376459093d87b8c58694f54ad57b4e3c06a013665f1cc802d",
  "18530ba8982b8a3e1f8ba2be2f34e85d957e13a66365cbbc0d990748335f11ff",
  "1d33e62ec0740f11baea99d520de0fff6a4e21e5693b1f2c60f147b2a6611074",
  "1f59fa545e2ddfd9968de1114d0a0d39e2b29c0e50387144b74dd6d82c7d2527",
  "21d51209fc11dd2265cd47b201a5596691b7051b37f83cdc019fa0331382ea70",
  "21d82cfecbf02f0eba0b2522fce5f7bd138a0426df58f7d442d962013fcc7337",
  "2a2a5d55942978556f58024863c0c84d5e0c7e3c6241a6e70092f64a344f9fae",
  "2c090e51791bf2def6d92831ebe54778a4bed9861517cc56ce1be7f1e5c4d8bf",
  "2dccc2c27994bf8aed02d58809ec487abe970a25c9cf0ff85a8838e5dfb1ed74",
  "2ddfed945a66b48e656845534e552a93af9ca8742b053b3fc900b2f0691036fa",
  "2e1401485e3e46077452f3bc5472f7961c495539073e224535d60c80d43e3170",
  "3a074a36a99122d183f874b9227d31fc28c8ef675952baa6c35b6653faa80f86",
  "3a2d6dfe8cb1182dc7a25e0202744fc025adaeeb735f729cad98234853d29a43",
  "3d242c8170705961272b343d2f03890839bc5a240494ab05c9c25ca75da83e9f",
  "3e03686e8feca320cc4d4ecb9516c778049aa7225bfdbc7b6d808a9b4efd1726",
  "3f84465422b59cda8e9c1375d261d884494cacd31c615e2bc2f4e20ed7e6cf3b",
  "409361e7907d810ab1eec92160a76e28d407d3147c2e1bb0b8db3f86b8b44b33",
  "438be15ccb9ef66b774985bad3b70d2e97043bf86edf945b6dda3220eaaf8708",
  "465951449c868547017248201ccbcefd87685c70e98517a2ee25339b3bd2b853",
  "479dabd03b9eca1b13de5df3960dbdfef46b0d3aad31ba277a34c9c3b788888d",
  "4d43314f300359bd240d9bb2bf824190edb2ca3f628fd70c72f58c7110006508",
  "546d3d22b480fa0776d749913a2d1257faa7ee5e5bb4a549a66376e9cbb09aa0",
  "590fa31b6c50108eba398cf376792cfb64725b72e7a3d3269dd52d6ecea7f8ea",
  "5b3d736fb56bd67ee3b864f6612931683112dba6750ddfced12fcdc276fdb029",
  "5d1cd0f73515f5c1d12a9191113f787e1a4834a380b390d342a6e9a5627f6248",
  "5ee6e0da7da627d43324b6a0be6e48dcff4c2c5fa1856045d9163b3e93b13e67",
  "6057f1b449f46d5f3c47fa8bd534d6ee02eea6711172be3e346a4e5f863900ff",
  "62b32c44368446a74ddef0d516968c4b9265be31e639e879c9e976bd58e073ee",
  "62d04ff7cee4a4cfcf21095e9af6424b26036aec23172cdfb5c80f50bb470034",
  "632a79762d6f5a4f0ced308adc0ef87ba03de7ec1e6e22a1b93293a3d051560f",
  "64c2ae3eb6bc097012c07d05d0d01bc68990ce15478e39711b3d31ad679f9903",
  "64d6bfeb65607d2dd1739d932aaca28e68b0502a2c5251dedc3bcc2d714d44a9",
  "686a6d5e6041416672e629f4eb16b8f9dda117a827293e238ea7efe4f882c7de",
  "6996cad681a7da85ccc783d965ad773299fc800a12cea720365f0ac4771a44af",
  "6cb7edc62cc311bb1b3cda8efeae76ed918d96c05fcf738546612cc1c5196e16",
  "6ebde83b60a00630642516e760f2342966550cc26eb1a53ab229645fc6923c69",
  "6eee3f95ea01ab4240ccb7a2b69c39a23e9d4cb1492e299cdf3348514b1e98c4",
  "70ea85cd1a37ec209cd4357eb402f8e9d4d43311e7675e179d6272dd61eb1581",
  "721d0bb300522abf5de16b0f71b45b7781b8da00c5fc1c6608d3ff77a8d45f66",
  "7392ea2aab8c6b4b6c39b05d6c7e49ac606e0c368af00cd290820b00313a43cf",
  "74af0904213e9c7513c4640a31a03d11a175f198fb34ba7c6c493f13ad206e53",
  "7920946a5046ddb70d2045afecffcf451ec743dff1bbba07c35a1ff696d46cd9",
  "7a56d04d5155aacda3c8a2cd5813b9ea6d5e6e75cf32c189c644bdea690cf0eb",
  "7cdef5e5414e98ae5aae68cdbaee63b26050d71828dced2bed88e69256ca4d9e",
  "81218982e543eee4389487affe35ab3af3077db8c3797874ba989a50f45afec2",
  "85a1d22ebc6e5246bf63633269ebce50a83f4082ecddd5ec3ca9a7274a612fe4",
  "8b37865a4a69aa0a44b58abafd19e01d9bb67b90e5a37a24f553125acf210fc9",
  "8b9f138b061ec0d5fee29a10f9929360e43b0cfbad40db15d3ea1a81accb5537",
  "8bed77fcf2d44bc4fa5e372feffef485d9ffacd19a1c024a223e78fd7a6623ed",
  "8e373c3ea4f5471a65e095ada241e72a3ff303b1deca0d43a1758818e393f7eb",
  "8fd52bb6ea29060094c3642716a5643238f1ab3a317ac1c26f389e27003fcef9",
  "9060a6ef2b3c2027638b708a06db7fc6fba77861da49696b2e8a89d3c596c4f6",
  "9096f8fc1b3be3a21e7461e451c9ef447b02987661c9756d50707de7d6ab046e",
  "91478d3f9c24e8f52c9bd8b140edeedeaad50e9f1761bcaee2d9d5798e0559a9",
  "923dc711ecb63fcb4431f21b34a0c527f38d3b06b7c3d9b4879ee0e94f2a56f9",
  "936a5dd863c346be3f6be7d8c6ec48477f33cc1649673ce6bb0d4ccb0f602fee",
  "974e6da5c89eaf22d9b76c6539aaa48f0344e83756583d646a3d33e86413de38",
  "9a768f3f496cd1f0120ec5b63c204ee1c2b82cb13abf95c4d44a4d7a347f31d5",
  "9e4614f0cf7722992415bb90daee0359378683d7f16efa6cde82773eb9f4ce9d",
  "9ea9e71aa3b5e8dfb1b57f6f0a6d616a890bc3820debf1abb407e1b5ad957e77",
  "a02fdd1a7a851d12ce137eefc089458ec618b99e97ce0ae500bf9ddaec3820ad",
  "a1e8e7ee2f38ed4920d21580aff6c52ebc3487408154a8ffef190f8258da40b4",
  "a2ae1f8b8105bfe22d558ee7c423d7306fa9b85f5714bb01afd238b280802362",
  "a384b299027283cb49a4eb9f73f6fe1f20a7bdd44be34f6b64075e149f961161",
  "acb32c5419da588136787ce8903969b89a42d9f3f2546d97574d70c1d72363b7",
  "adce910c8501994c989fbd718bbc57103b75d3c8a6829cba012f4d4266fc94a9",
  "ae85d5b37c4b72720f64bebc7fb403a8bc401860daf76343a1c3ea64fc4653bd",
  "afc9f3a57733bcc37ff7cbf09c62c531a827dc06f99f9c67966e2aa34b945085",
  "b163adc4da7759fb7dfaa71983d26d0efd8cbb1a71778125b77cf6c6abe9c990",
  "b38459578831cc2dd939d2442f1bae0e2d4ad76d3bf56bff504788d6f26c71a3",
  "b5e52cb3e3f0ec5a13426f6f3378d84c8ead7fae90b40529570115016700694e",
  "b72357c933998ab1bf8968e6377cf790a7ce070a457c606f3ab6cc84171b47b6",
  "bb5cdb6e6717e3a8c08ebae05342011368c1a714979159a6c592adbee7227c9a",
  "bb7795a6d1aa99a78e8e7cd0cedf4b5c2de7afb6c98e1e7e24d5029d612c74e9",
  "bc0782ad089b075d4af1bc14716739e83c8ffc587a804ffde6513a546058b227",
  "be72f336022e0c9cfb9e28069d0f20d81467ddc3c81d15ccd26234221a230b66",
  "c273a49bccccba2fccbe35a492364e63016fdfc02834d8a7a484b4dc226ba19b",
  "c419db1ead0cd8667deacb595a9e001580f5ef2c8caca4cb575bdfc551097cf6",
  "cb0e31c077e56d5e0b6739c36c7d39a8905dd44d1fac3c6f940ef5f917521954",
  "cdaf781f65b97c82384357c257fb062d62b3d01559331a0d7c6de85705f5fc0f",
  "d11bb009dff54bd3c95df46310e7e51925b85ecfb11c72aed2e9f0de9b67b7a9",
  "d1e3be29f477f0165ba74a3dcdb2cdba3bf793681303e095a907185c8f7762b1",
  "d59a2de29ff33bd85fa7397595fc91c320984204428a199dbff7588e70982cec",
  "d6d7ea744fd66ece8a2ef15eda11a4f85d625d76b60c14c0ecc9bf97ce1c0fd6",
  "d7cb6aedc23d5c680ee0a3a563461a1c05a92210a6e0ba3832a289bdf722d921",
  "dd2b6f55dfae51328ad0cda38a77e76acc6d336a92e43b86027f26368b38d73f",
  "e0d2a39298a54e3d07b9b52ab1b7132e646c5487c7c74a4baaf177c9bac797da",
  "e2a2109844aeddc7c8723f581666357597af963b85ef6c00e0bc49489b288e88",
  "e37d181f36ce59a1a058361f346359362d1d900bf2e3d2b4248788c4707a8298",
  "e77744f145a30f67e3c021734813cec005851ed43eb12c92f75be5073b046746",
  "eb2b33699f304fed9c3bcc8382d6d3ecc469afc66b19cb6b43e6a0180a3849a6",
  "ebdbb165934385bbf761c4844766efe0ced71bf5262ccbdbde0442a4e8b0ff89",
  "ee23fa4019767102a7d3cce4f8d3934fc993291a4792d9ca9b5ae64bf30c2bca",
  "ef82616c7e8e101742acec2ce954d9ed4dd09106b1d11e82a985f061061c4196",
  "f0a31ffe5226de7262aa6185ef12f2262bac8fc0068d468540f99a3eca5c533f",
  "f6721fcab2c7acc1ba72633d86b8615ef6895827363f7181582ff272766893c4",
  "f8632a114bcde7b25b6c3cc05902fd387b9b7d9a38d91eaeb9e5ae1ddf24f227",
  "fcdc3fc39d953cb32d33419c277e21d5507d39cac865870992b2aad8e8f3672c",
  "ff65ca288d2c35b44e2c85d1ddf6afcbbfb34e0973cc3a576a889fd262f6e143",
  "ff6ec3f46f6cc1ce6e9c677929eb706d76e95e720287f91176451c1d930856a6"
])
const cacheHuellas = new Map()
const SHA256_K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0xfc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x6ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2])
const rotar = (x, n) => (x >>> n) | (x << (32 - n))
function huella(valor) {
  const texto = String(valor ?? '').trim().toLowerCase()
  if (cacheHuellas.has(texto)) return cacheHuellas.get(texto)
  const bytes = new TextEncoder().encode(texto)
  const data = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64)
  data.set(bytes); data[bytes.length] = 128
  const view = new DataView(data.buffer)
  view.setUint32(data.length - 8, Math.floor(bytes.length * 8 / 4294967296))
  view.setUint32(data.length - 4, bytes.length * 8)
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19])
  const w = new Uint32Array(64)
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const a = w[i-15], b = w[i-2]
      w[i] = w[i-16] + (rotar(a,7)^rotar(a,18)^(a>>>3)) + w[i-7] + (rotar(b,17)^rotar(b,19)^(b>>>10))
    }
    let [a,b,c,d,e,f,g,k] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotar(e,6)^rotar(e,11)^rotar(e,25)) + ((e&f)^(~e&g)) + SHA256_K[i] + w[i]) >>> 0
      const t2 = ((rotar(a,2)^rotar(a,13)^rotar(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0
      k=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0
    }
    ;[a,b,c,d,e,f,g,k].forEach((v,i) => { h[i] = h[i] + v })
  }
  const resultado = [...h].map(v => v.toString(16).padStart(8,'0')).join('')
  if (cacheHuellas.size >= 10000) cacheHuellas.clear()
  cacheHuellas.set(texto, resultado)
  return resultado
}
export function canalEnCatalogo(canal) {
  const id = typeof canal === 'string' ? canal : canal?.canal_id || canal?.id
  return !id || !huellasCanal.has(huella(id))
}
export function registroEnCatalogo(registro) {
  const ref = typeof registro === 'string' ? registro : registro?.canal_ref
  return !ref || !huellasReferencia.has(huella(ref))
}

export function crearFiltroDeCatalogo(canales, referencias = []) {
  const porId = new Map(canales.map(c => [c.id || c.canal_id, c]))
  const porCodigo = new Map(canales.map(c => [c.codigo, c]))
  for (const r of referencias) {
    if (!r.codigo) continue
    porCodigo.set(r.codigo, porId.get(r.canal_id) || { id:r.canal_id })
  }
  return fila => registroEnCatalogo(fila) && canalEnCatalogo(porCodigo.get(fila?.canal_ref))
}

// Presentación del admin. No modifica inventarios, atribución ni registros.
export function canalVisible(canal, estado = 'activo') {
  if (!canalEnCatalogo(canal)) return false
  if (!estado) return true
  return estado === 'inactivo' ? canal?.activo === false : canal?.activo === true
}

// Una consulta directa o sin atribución verificable no se considera archivada.
export function registroVisible(canal, estado = 'activo', canalRef = null) {
  if (!registroEnCatalogo(canalRef)) return false
  if (!canal) return estado !== 'inactivo'
  return canalVisible(canal, estado)
}

// La vista de contenidos recibe totales sin vigencia del canal. Se resume desde
// sus períodos. Los cerrados conservan sus visitas y consultas; la cobertura
// de QR y canales corresponde a las asignaciones actuales.
export function resumirContenidoVisible(base, detalle, canalesPorId, estado = 'activo') {
  const periodos = new Map()
  for (const fila of detalle) {
    if (!fila.canal_id || !canalesPorId.has(fila.canal_id)
        || !fila.asignacion_id || !fila.referencia_id
        || typeof fila.referencia_activa !== 'boolean'
        || !Object.hasOwn(fila, 'vigente_hasta')
        || !['activo','pasivo'].includes(fila.canal_clase)
        || !['visitas','consultas'].every(campo => fila[campo] != null && Number.isFinite(Number(fila[campo])) && Number(fila[campo]) >= 0)) {
      throw new Error('El detalle QR no cumple el contrato de lectura; no se pueden verificar sus totales')
    }
    if (!canalVisible(canalesPorId.get(fila.canal_id), estado)) continue
    periodos.set(`${fila.asignacion_id}:${fila.referencia_id}`, fila)
  }
  const filas = [...periodos.values()]
  const actuales = filas.filter(f => f.vigente_hasta == null)
  const ids = new Set(actuales.map(f => f.canal_id))
  const activos = new Set(actuales.filter(f => f.referencia_activa === true).map(f => f.referencia_id))
  const inactivos = new Set(actuales.filter(f => f.referencia_activa === false).map(f => f.referencia_id))
  const provincias = [...new Set(actuales.map(f => f.provincia).filter(Boolean))].sort()
  const ciudades = [...new Set(actuales.map(f => f.ciudad).filter(Boolean))].sort()
  const pasivos = new Set(actuales.filter(f => f.canal_clase === 'pasivo').map(f => f.canal_id))
  return { ...base, puntos_qr: activos.size, puntos_qr_inactivos: inactivos.size,
    canales: ids.size, canales_pasivos: pasivos.size, canales_activos: ids.size - pasivos.size,
    provincias: provincias.length, ciudades: ciudades.length, lista_provincias: provincias, lista_ciudades: ciudades,
    visitas: filas.reduce((n,f) => n + Number(f.visitas || 0), 0),
    consultas: filas.reduce((n,f) => n + Number(f.consultas || 0), 0),
    observado_desde: actuales.map(f => f.observado_desde).filter(Boolean).sort()[0] || null,
    desde_backfill: actuales.length > 0 && actuales.every(f => f.desde_backfill === true) }
}

// Evita abanicos ilimitados y comparte lecturas en curso entre filtros rápidos.
export function crearLectorConCache(limite = 4) {
  const cache = new Map(), pendientes = []
  let activos = 0
  function avanzar() {
    while (activos < limite && pendientes.length) {
      const { clave, tarea, resolve, reject } = pendientes.shift()
      activos++
      Promise.resolve().then(tarea).then(resolve, error => { cache.delete(clave); reject(error) })
        .finally(() => { activos--; avanzar() })
    }
  }
  return function leer(clave, tarea) {
    if (!cache.has(clave)) {
      const resultado = new Promise((resolve,reject) => pendientes.push({clave,tarea,resolve,reject}))
      cache.set(clave,resultado)
      avanzar()
    }
    return cache.get(clave)
  }
}

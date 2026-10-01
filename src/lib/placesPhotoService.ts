import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const CACHE_STORAGE_KEY = '@destivo_places_photos_v2';
const MEMORY_CACHE = new Map<string, string>();
let cacheHydrated = false;

export function getGoogleApiKey(): string {
  const configKey = Constants.expoConfig?.android?.config?.googleMaps?.apiKey;
  if (configKey && configKey.length > 5 && !configKey.includes('TYMCZASOWY')) {
    return configKey;
  }
  const envKey = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
  if (envKey && envKey.length > 5 && !envKey.includes('TYMCZASOWY')) {
    return envKey;
  }
  return 'AIzaSyAFeiDtoS013DQEmkjDsJkzBC7O_pu-ZOQ';
}

export function buildGooglePlacesPhotoUrl(photoRef: string, apiKey: string = getGoogleApiKey()): string {
  return 'https://maps.googleapis.com/maps/api/place/photo?maxwidth=1000&photo_reference=' + photoRef + '&key=' + apiKey;
}

export const GOOGLE_PLACES_CITY_PHOTO_REFS: Record<string, string> = {
  "rzym": "Aa-ngMYvttCgmq5PgqtbpY19jUgtsyV-Xj1qNgmOhjnWN1B_rYrwta0zDsQWHN5ZJWSl02J5Psmzj4LS_conZgGaZotsN8Zpz_GrGuHQpHdQj7iqLyhJcbl0wQhGdo2kwyHD04ECwbL_hzjnOcJH5gKDhv3rVQbFUcFakCfqYfxX-1RftnSuhP_PZShc_dj4W_Mf6BdSLuBfJS9kRtF7Msjk1yMCOqIg0WoZnq3amPJl1Z4QVRdA3aqxsVKKtjPdfxJqeRWHmSD3EZ7GCT9i9UzPnygn3FaYUvzDskK3GLKIz1c7Qml8bclmzYVeqZuAhA5C7ZLYdAp6xhPx5MysYI2gW95WmIunGQFTPDHbH7iI56j36HE46pL5EcELBW4T6Pk4x_R_XyClCmJp-ZtbhEI6C-2fDdA",
  "barcelona": "Aa-ngMbqYwCVGQYTltF6D-Y07Sg3RfnFY6QfXCUTdNA1O25CV0_6dFXhEG6p-jp0RyDVGw9bAMREmZQMxgIl17ZsamyHcqrqIIrE6orrzUpB3uvRVTM3J2tHy0qV-NJBzKEkVkTs_iDBcRojRBJsDgFYvSr9Ljy0GaG3TFy9iDoDl1DAK5h2EKFKYTk8ZvbG6OoJ1wjuJoBbJNEiFUw3y8hQnT7pWR-QZgRLOl7cAk--kV9j34Vt9mYbdSqD1nSviLfCCXlU5RKRZ2Mk1c44UKFbbBp7eA9Dix3USA_tS2yEdm5YGVMynYSS1DJVs2oOH1cjsrR2UlrNuQb6LPBBObI7GZMFjXF3kp8hZbNrcvoel3CD_Tm91scPsCVmC0imc-94dtJ1V4NZT3rU_N3e1EZ5GWHQ5BCwdSXEVAciu4MLoa_djg",
  "paryż": "Aa-ngMZM-zzxioIYpzrxzKSR99FdM-gTkVTHPYhxeS75i2PgjTN51W2_rbfGs0pz40I1kC4fbZ2EtvdPpeA3wVwmuOgAHOCABt36cCfldwT5nmakJP3grmvQ7sIcmQhL2gfTDzmhlBmHR3Mn1BH6GlVXK_65RGBI1pmSPVrdsLeSr8xTvfSZdM_DrZPKQRnmI0HX5o_gAfnblYZ1RU65zEU1ghP5kpHIDmvwP_fWfHOAOaCFpjtf8ouUWU_VnPo8PSvM0RkusZ4SeT6Ghd5YTxWi6YqKlnxOfCzQT5i-SCcJENbC2ejN-RTWaKzfVrbBGf6xRKkspeO7mcjck8YZCpIQrw5EtFDzwmQ3_4RHYwK4YxIcu5yBzfafkQtQp2cVjgJ7GVOcPUTngjmSBLL1bAILz7NVtFc",
  "londyn": "Aa-ngMYGHZc9KoyFgXF-zD56NP8_HPtNn1wcAkQ5egjhewwwMDY4B2QSZaaTk-r8q0Z09zpgU3LDs8WPf5ZdCaP2QIPOsd6ypvg0a6q2aJSV3wwh2cRaYan-TZLj38hIbWBsSOBVn9KL7TmAE_T_W7lOp_sa5qZUbZjY4Prm0sW6MFqbTtBD7AR5kTh84ClzlV5TM2uzp8NWiovTLB0dBw5_fb8S0PjuDKK1rYgvbsQsL_7iRo-8zZ9SJK4i9NOXVoGKQuVZCdEntnzhCFnPf9NDooZonFhOdMg5jg6qS8uUc5SDj7r4wvA3Ovr2nyrLXdG-B6HVx3WxuXjymTbi2wYC4GFW6ErzWFeeBbeDtjtS2TWyquR89S4fn3K1-y7seXqYacTUjSB8W--b1dwg-KXZFLh3mwg",
  "ateny": "Aa-ngMY96VmgmA1W9bEO93QFZGA-KyJvL0nims3icic9fTBJstINWNHQmMeh6LtZ5im7W1fa0VYOgDO6C89uS-3SCyWkTTraVZx1TlNxF3VOvVth6dIIknldL2RQ_uKR3G3qpGZWvd55JOunwhhe5wVeiRUbpOskh4cyV8qSyzIqMeBTv7t8e4KxOrJyrqkNAS-1boZ31RxDCEXdxifbYap_88pRvy65-r-17V86cVVF7UdKeiS8-kQXVUwW3Emn_sQqU4EZR1m9bQ999wX54AaMQc0EROZkiVjK8cdVjLWHdHceXIoLROLJ0iXNKVA-kVMhdI9L6O6er-XXAYDZpN3uUw9DCPLpTQl5i2L6L483cPRhjC3aI74Q8FsusnJu21QvDgCiUEJx8qZwTqbQO1m5hqOfRESL9aEx3vbGO3XazrU",
  "kraków": "Aa-ngMYtjDQ7vGjF710k7qqK20RTklY0lWkIGmnSkcGICYO-uVWYisLDo6UmYXzGeQwq-7PxXtVH03sqnVLbpaG0xwQ8Z171tg6XpFSeHZX1dfkiWChDJGqxXlSwKXC5Xv_kKTKv_hIdtNbt-ZzzM0vApb0_jBuZLY7ggGkvI1I2XdF6Bk60E3hH1QttaH1xqZ1SJ8j5pYI8iT1DLqYb2lQb4XnX_t_H0Ji1hX8gYMN0cGJOiGK8DRDy67ob9rBZ_r-fv6x2Q4FsS3sRCSamN2zSA0nsSsQrsKn5jH5ZgfjNnibUDKMw00pzkNEsf9Jr_mUQvKpJfw-HG9KpLRk5i6KJ3pJyyUvaa-AASrtW9aDgjy2WLh8FSNCkszmKLtz0UpemAEr-tzkdxNvXy1zLDab9eOphaiRDaLk",
  "praga": "Aa-ngMa-I-Ybccpc66nRnD_nc8q4rPwihGN50IpD3YtgNjTyWTLIy6YC7yhWOYVVERFK70yaIUHVuuTRC1MFr370JxesbZS4GOAhDx5QvJbjXe0ave760IZ7DnrzrRk014Qq9bVBFsMinEClgq1sNwkIqS3TT2oc95LuleKulHbP1n977Xrnf1rcNq_hhnKhmgajNW0SFgU1aPeOpSjics53UPozdzNjd2_xRJb0_xhvduhBxPJZ51HLg1AFXldoN4A8iX7USYpPNmspooE7lu0IuTpZJyB8nYyVujVWw1DXoUskXcJJN7xjdWMFlh9WEJGrSIB6VU5kxORvIdVopdSfy9WCZBgA4up4gkx_bqaJ68-vvWkE1k6zKEMRLiVZJFW5vEhqLm9_paodxlyXLkO3-8IXJKqzNhjwUmcJAB5nZ_4",
  "wiedeń": "Aa-ngMap4hxyMByGjqNNow_VAAHV7UL3s7-MK1gJqePyvqpnerOaZ4voI4T26V4cTfkd_0ueH_9OCUT4iIsgucHoI5wDPVjvteSnXn-oB6y_5aiNdWl2U9IKErQB5q1lJ7tpi7Pu1g4b6SMnW15O-D9lXbEZgaafHlTdt6Ifcjg7vLbEJY3MTkTsB1PVdc7_kv5MVZMSDEhP7Zlm6KxZRRnLjV0lDkJVhhi5qxdxILYHEESklexuSJ7E3FimDx7iNppwTvClXgZ8s---e7aH0H0GK3HkoGS4PD5ObZazbwS0lHDaPQVWRjPAosOtR-M_2eERXSdwpQeQ7_M-P0S179zqxBrI1XDCFbsr4i-Ved82F_QPAo0bgLAxjE3_35iW2Kvshz4ZgIhA9m_eE4B1QfGXGC129zM",
  "budapeszt": "Aa-ngMaaxhVqQf98LeFErtGW6AZFMTaSCZDGxI6trEQ0sVlUFcZ43P-RdN-3fyuvJou9m7pJv3dpo9BkiFhNGqzfIgygT93iFiDfBMxUcIKAQzSJfLtyp34i9jkCq4tMwlvB8yo7lsn6Duf4fc0PfpfNPnm40FVQgAkHQVeDeX3KuHfb5HTX2LTkN67UasFCyNkOEzzlBOswcMvU-abDgq3lYBHGsVbRSUeWsn5JG8hLOE5eTdE-fhmYZtfxSUjG0RMdy41UfUHBtOH7YmhXt_qBsRABfjxSqlKxGaKngBtIkxXrWkWedW19qWwuRyVaDIRiR0BHNNqHyDjNkmv4SNw-rgbCrmI2Czzwy8kN0_OkAFrGkRhK3rmbd_QmqmsuKI2KAZj0EtxlAYLC83q8wRJtBUIjPag",
  "berlin": "Aa-ngMbFt-mNA_ExvOoS8F3xqztAGLYyaM383LqEWFFpO9XnR34FMXvM0oJRK3OJ_HgdYyAyx3VGYRjtJTEp5ax6whvRryoyvvZDZzV6h2viTvRI0Gy849C-e5PzaVMB9r3URDt1z21KdGC-6rUMIPmlZdH1qNkyCUqfThJCvm_RKhYw9NHHnXhMmxFlHBfrdapZD8nVN3RXrBruDJv7Orq056tFAwZGjkBFm9FugN-Ga_THa6brrlE5pLgh3EENMSWDHare9QKoEQCrOHdM_sMuB3wu5tKnPHMhwQyYdVkrXx-jP-lCdYpZCJGVQ08HOGo-f7m4oslmKNwBNtnl3Aa4GKntUIAP3tlrnVcg5rdVD0MEFbWmobwyyv-HgdM3Y8Rl-6ZHFnXOkt96SuWnnQJQ7HAd1-O2NKRXYOOmFBdGT4GJ3R6M",
  "lizbona": "Aa-ngMYVwf8LUUTlASdz_sNPEXo3EdJFKqb40xkx1TrF1kO_gwhl1kjlipgped-Jst7qCVh61X6lJzKhBjT_vcp4Fq9mVgbuve4C_t2Ux7BWO5553Jubm_NP7rhyTRRwnYn2Ohf-mNjiBrHbnFNV07_ijKzwguRWQBmdgGtMFgDyTQZFZaho8MpxsPR_zOzdhQpQISxcnER2Qm_jH1Fp_tCYMa9G_z76ElL6AmeTTSuS-AI--KPGnVgT3ZPYdONdSm-xcxqj0PJwPN3k_OO4oTIaeTArJkwdhjmvA4UYVP03hVoyNQY_Kl9TcMVy6JyMOTB3wa1nbx-el3sCu0pRkVho00BRJQGyEC0U-BLi2-G3EByejdl84oRfXO5M6fKfC2neBN5AFbyRt57O2UJREadjhL7_B11LIv2m4LYO7tfTdGfWYox4",
  "madryt": "Aa-ngMZ255XoSY1OVsRJlf9QTnP-RPbyPJMQWPt92ab-OaCDilNbO8ZkKe2a-Pzu370HAT02S-skFSuJnH5O-XXFbaLo2yJJIH_DSzfmXlj05fTjJd0qyWiDPVktf4hAeBZMMkzaoE3wEBq8U2cN4Y1Xaa5P2MUEhFSsHOePLStWVZqYOYMgV28vrufqQnaYeAGxc024h4HixyMGHpeWPzViBopXHW0B93M-Qrn7QnfMHLQebd1tY955OMM0gLt-8NbZuWObn7B7Iy6Wpovz9ZietjzfL-ooA79xjZpC3xqCH6PNWFyxtLVfxjSXQR2CkgrOIM2NS_7SsBdTUQONvG0TiCFkZviUJlYTFGPHhaDaiRM5OFoHtL-h2y2ofmqadmLMTr6erDl3JVnpPegD_AL59MJeg4s",
  "amsterdam": "Aa-ngMadELhwJXw563Bxwg5AkAM0H3kQwPovOkXzf1yhoDtqOIOyYN9Ena7MW8qPjwv-UF5C-rC3TJGEQ2JN2XIlbQL3-04COYT6EHMzo7h8Xae7aCpFPucG9lRh0_XCkYjpcQ_n8zwC1SGAY5Wa1bq6qc7_SNMpIv2uYrw2Wb1K2HH-T5Odrcobj6FIrrZvO6XUkWyjEXEzJl3cDaF6nARkUQGVkVyy6lYXsmFXBhyemuso0R21CTs_WSrGC5sxQOqmocQeHCshNp60Co9uM-3pVWl0b0fdUK3cnFEWGSXYz0Lr-usQ4Qb-VHmkGnUx03m1ZkoDOCFRnRd6FjM1Uv4WvnQ1HHWP7KDgULd_3AD8zXwYCfCXRX5Xah9WMRRryGlYxiV_GrqTYnspjR3NuQuqkdpyURZt",
  "kopenhaga": "Aa-ngMZcUdTqgA8o1lcuzamsgqvLvntsO277giUQmtRMoE2DhnE31mYv8NDmRm5yBRIeeL_yaoBOFU9QNZA0cOfKLJfO7tFweieh2eYA__Pvu-Ozv86Og7pgbt1YVWQz4sjt1tpdDS-2EtG0sSkEa1ftNKCWCqd-C6nVFJKfLdNJb209kfq8Cq6nBhv4dDutpe0630ri3K0rnHBcedKL1RJ7f3ZFoTF_B3ZzdaJAYlTkhLiYSEdfzPZhDJJlRXFsnvf0cH2rN7mD1IEpJcbV6CNR2wveKszE9HcbYpHeOsWIlUuhDXEQQj7DAanIFGBUZ5XrqWpWHWUdofc5hg67atkvYfMXGiC9Wi4bZA4PcnWjzes69h1jZSfffjBpAQFIY3HQJ4CfKsIJSOWBDUUsbQT53e-3wcAurKRwJVV89SWwgjk",
  "mediolan": "Aa-ngMbrc8cipfvPEJ8bCwxTU4EtDfWRkHIkpyv1d1gak3Rqb4_zem0ZI-3ITJBtSKuuFr5pZwzZgYArwXa8iBTNBQQ5iq4lFXFP4Zy-tC9aZKmr73Ya_iBYFVTGWcLVTScXmn6GiQG9cIFAHYtQL_KHIKGQ6FQaInmHVlp8cg3KGXg8NvZTQ3ToGDeqdpS0EY1dWU2f9IbjmF_LWjkCng8j98FpE5LHBMENt8UdckXel1yrOpIBhc58FZE_MX0t5E7xmZ3vREn1wDctdvuznB81j5ZxiRcBLLL2ZGZ4090YTPQYv2iOmH6Q_vsdT5Kr12uMXY5zV978_vhG-9fxdM0pkxI5iJ9U8cZQ5xRjxfGHrlHSEOmFOkyMzXXcrM7ck777eiXdKDvgXorYI4LGtW4X6bcKHiR4WJ4",
  "wenecja": "Aa-ngMYtwr2uHNlvJR-BSN8npkH5XF97nWog1AoyftgNYvaPP1UrDvIbWTFeXQlPu9Uf2lXcTo_VB8JU-tTfAuKkC6w6ZrlkJdypYoNahEvS0ClEOZzH_7NbmhLXbX6nvUMedRQmDFzuWkk8xwGEVc80vLAwYJ5PIQ9i-zESziD7r9GIyUMlBxcHOIUPsabAxzU0FGc8M0NpeCIeYYyzYA2BACdTudC-fgBB9O0EMUN8jmww37h9K5CSmNSTtyiMB42P_RfKaVVl3iYfmpMVqayM2v-RURCuNAwrMxO7fvvuLJgvlPs7D-ijR7VlfKOOfWlVLHFSjHdPpQzEmQpXIWYY4BoTc6hF5KTUZpaL4cxaygIQA9AqINmshBQQSfFTs6fsoEsyGV3IfL_35fSk3WaLUPi-AzyykohVXzF3lvbnzz7huw",
  "dubrownik": "Aa-ngMbMrvJU3lVodS8brT6tf0-iNBxLVNRdR3ceUmkXHm0yFFok4tRUGE7XgfMtPwTl99drZrCBPWsjaeYrE-G_QQklfl4M0UTJgb-gNA6F1Cy-pufAqft1TFoZCcD7UibNNl_LHoRYDgAOdWVGz2Fc8J_w-XsSaUSaOA7jmATBjrds2R7GxIBQu-wTS_hVcIO9UtekKYwCxKeiqvT_Eb4tIm6Pp5_E9QHTvfHaQqwdM-1SXGgKp9o__ydoCJ7nJewrLjvx-znv6S9tGGqJmpsEI6KakGHkvWOnHfD5Wc4n_EoolK3nklgFnajKO5pslRl0D7F-wjkc13aO-RcV9VqkIma5Iv7fp7GzzzW_2AVHfirVIS7SEUKpOaXpv4L7KK6bYucTVw2cjiP6OiWnWJjS229E7GIClgRURtlGqvhiX0Fwqg",
  "zurych": "Aa-ngMalpc5OvrxuS_zOJMZy3AhGB7MXQKqEC-HnvIwM7YkPMvtqN4SJ-iBc-9xgun3KGcWVrRA8YUPQMEtj5rimpkZX-DWtMrLFhatIAQ78j2lK9dEoU-N2T2NsvL7TK4dLBwhNhdwSzQL-xWzvVPK3LHh5Dk3YdXKWaeVfrrUSp9xsz0myEkLJj8nYCKgSZB4ocV4q1NpPBLWyZL9uSCPISEBdE8dBE64WFKnrHbTtvNOO84eVvzMPUNLQHPT_ZXCdQkCLE4r3Qfu7ifmaTKB1mvK7MVSb3GgAyNDxGYtMc5VJ9UBy9tFbf2zeFUKKrOrjZsvRHNjNqb3beuZOr1tZHJVAE9rZ5NRvyjg_bgb-fGPJd9-CRhBOr4j5jwQhXIBMj9-32udMABAWQ1peGPLMxqo4-KpRu44mqq4CNlxbV83njbc",
  "edynburg": "Aa-ngMZjrxd7VxhauB3YHhfwf2ZRJ5IGD_kw3GTgF9TgybXBkLgPqs5HVGsUre3sLNrdn1A8lYseprLc2VVUQQwIKRUjSlIj2A89vTALyjiUd7HkHZPgiMkLhKFImW4gBT3rKVhVX_uhvUV75wwKoAG5sJ8r9wxA-dRkG-9QvSbeYtwuSkiOqoASb4OXZJV3MnZLsWh6zfvQw5rlqvjCrCVbhZ3TZGA85baK_a1kO0qgJjX0i5GJDuKllzSI_DOjPorMOhqjl7nusYJ3wRYfoZYjTmSRnKqTi45Q60dM2jAyUqvzmtEYbp4JFbPpOakoXk2SEGp6o8x74WfOBxH_YaX2L9ZZSK5gRncrQf28UPOdD2VfLDuXuo8oLetXM1R-7Oy4FcmTMXTjBrmDfcuGkaTE1ki9edNVXcEO1805XmVdsQoDPw",
  "dublin": "Aa-ngMakbLjvPAqLw4mtqRSnXPKuAnZMv-mUAAx_yM2-b0d-YwN78lNiV7Io3-ha4QDT2WrufrPSwKrXTYxYikbh3xq-LAbkCkKMzbhMy5GB-YqtlHV9VvN6-3wr5bs_Zs9wfWnX57LUKT7ZrAcwbygNcw6TovUL-B2-P-vSH-CTbElcD1yEtHRTY0_unJtXYc1v_ECW_8QY9yMY3xA2d5FFxMuf8FTQu2PeR-1nD4bTzeyhoQeeF6nxo4lDRrcBVO8VUab5C5PoWPJRzqOw5xjyMPWUhRv2eDqLOTa0AA_EbfsFwaH3qtiAk0BWjyqRwIkMhhb25NnAGAe9UkD0UlkxXqHe5-9yayIqn_Bg3mbfpYNsUU_WVWSwses6urjkYrIgeucQBSdP2tCXmJIP_eFCvrbDet16jSk3QcbQr45tHDxeGwuL",
  "walencja": "Aa-ngMbmcUhieDDWPwBv3U3WwCuDJQXRnuj28rKiVVIG1XFyBlodVQIdLO303cXT0bngP0F1G7jJhypzlAl5s4eOx_8X37etuYWcMm_XRmgg6hIsMZEyPxToLbzFVqK3m41tWhpxKN0VeSsmlXifWsEQGJtMbV6qu4crW3bg0sIq6-yXhxkYYXdbQI9xbOYm_I5xLjuBid8whaXJnav5k2Q5j-RtY9y-jBwzAYZRyGrU-raDQJ36S9qBWIfORNqu6BZTWImHRHxyoHPVVKX8ktZGIfgB7aMkPlMMV9h8QXFAOjmKyZh5wDMaBsM1k7xfXJXwZBYnzoySjPQaf8t6pmDjZV3yeT6LuPET6142CoTr-_wYxpzilrOES8NwiM-9qEa0lfyvkyIeLqBOe3y8VCbE_XdZAT6g2wxT_S1BbjS8E5w",
  "neapol": "Aa-ngMZZZ5GLOl4IU5tZEmLP5NCPMsxUK4DdBIS1--VBA5Hcp3vg3blX3uydkDelCBYS2XT9kvbZvdYoEPeE9FaIQVH9zzeQ8Y4AEgHk-nawToLtCKXNtrSD1rH-0tND04GN6gPrKw_ZPQex4jZt8DoDM9uu_84E07ykOTXE_QNaNgZHgUUBdvy3nwcFa7FH7eBtrTieTiq1JRwZXZJuh5DC7HJnfuYByr-VbtEv7kVwoM_TRrMVruUkEUhvBehDRo79Elip_yMZFcBDD4Xm79gr6Fi8pe6QtELeCfOKDzhFjFcS1QQ0ei3cTMaYDnPjIZCeBkG9pkQ2MTVx05fqwCN9LN0wJ0-cW_1BGPzemzJhqSgu0c4JzvRk2YtsZW0Aq3ukTJsB3414zR5EsmbJbpRn55cUsyCNPDA",
  "porto": "Aa-ngMZyM73znr612zYaswHsrgTQlkvxNmsj3GTDEYnwyw77sfjlLrpFbKoSFnqBL1wFxKpFMcdMKiggRyJ1JWXCbsqTS4K4LHjdxx7Gq-4kyfKYJfeuMZnTKnl-1t0n7r59988lCr6gk1Bzk-DuvyRbFHpbq4BguLiiF9kJgcSVZZ1WcYtFSLAXIdjTYiIC5040xuln6hLLLOUAfyxilEq8pNXr3KU-b9f98ODhhl0739dLYzxP0HeoH_KMy_xjvI8KDIsmIU0PcS-YJZMBdNLF6mcijatjXLR8vIO9rFhU7LccdBYaG8BT21NFSKN6tg5FcKI-aOt_afn67RJ00TtL_JLsnPnjrFQPfhNW8p385pUV0qdqnifhZ3IN9eJ6j6Swac9dGqSv0XrS2ZXDd2U4PzC1qHk",
  "stambuł": "Aa-ngMZ0TcuACyCMe5DHlwCXPEwSPjjD4JLAtU5ij97RJHah4tByh7216vLPJIZkeKQ2TGxQnBB94Z-_p1DdXNJgiraxEFZHfmvEEluWcp16dBRYQ8mXaatl2w1dOyzSPd-YSyOTRm64InCIsQqMLB2UsmkXC80kGK9PrsEziby4EavJpx002hMMGEYcYMAo74unwyxHMnepmnKXH_lf-1GnPgzPVFRg1KKOoBoPIXh3JkhkPH-LNChHA3rjlFUy6l2FaP1Ka41O5iSYIG8D_tRpbyoRW3YdjmcncM17BiM3mvNnAcLnk_kyQBw_eItr13HnFfZZu4hkoBPjLdt1zU3HdtavUOAkVKXOk9Kgz4Rl8thFzVI9ZtsaO9fJupqTiZpHPJhsLIhmF3j764R4Za8bmUHh1m4xwdkBa_g843lTS5QgWe0",
  "nicea": "Aa-ngMZBH_8n8R4dVb0Pg_QJyBqXlL4Pf75XDzL1FFWe9vtwaylO4Nui4HltsGo9xg18zPy_mwrvZonclfBmmS5Lpt0p7AYkuWCcci2nJtuGayq6ac7cQ7L8-FJZ34_sXKvHN6pbYtEdSt60MnxthYK-FrWBu_OH7K-QS9l8xYVGxkO9K0Bbwu7M8xJU0WYf10UOFjyadSKv02x7ueKxyzAnlkZWntg9Omsta5bpCajplgLwS76OA5gQNX5shLhVInDgwtY7jHN-Pzc-9hLqZu-_kdoKjudglphYWviAvTJ1L955s22_wWFUrwyZ6aX6HG09khOjXzSuidO4ZyvWDxG1M-Ej4j-9BvjeM64aBT-Of26xZc7NBMb5IqgA-mAp-cZit71YQ-PXhb7owb5oScsslqyS0GMFrNE238P9MOyHXZ1Rqg",
  "monachium": "Aa-ngMZTttgdghbSKPH0NotEeymAwz8mS66xvUy9KNhRqbYdFB5fk5KsX18-pmaEZ7jDzva0UP7Vr41gp0EGpyJMygZIrMksVNlLePLlyOThwfaDF6kEc_IRpRt3yeZReg5hM224aNErEFPc2GdYf52NqKKAq3eX21dRCN2_QvHPuNbV_su3_OE7JnfbLJKxR_Fj8ipKelwnl4lqfjlFjbbCwPsneylHO5Zv7KdOa65IgIAJSqR7gLMwcThij69-iwvJPwqGkEaEXrY7ezj-kHFqKSYaUGF0ITIugaVd7LuRYgJTwSdMOD1_PbXnsVTvPEecAZEdr2YB_M8lcEYEIuZZ2T8NJDl7I4HDUDlHhDGOXg6sHhBsRZfY1qhRmmLuNUVBTwJYA9LlhTNiFqNAfiwBcpgmRh2RakCxtjO6qLGO2mHYlA",
  "valletta": "Aa-ngMbb3jdO4WoyrmWBzyofGOt3wfF1_4Og5UzjJpy8eJzFBINAGTKX3FGcCHl2zyfcmVAjgIgfcdGywohkS0sPSY9fEK6Tjy2KdJgco3m__ASWF4PFApm3wh55TfuWIgFidqWFl41wzwki50cgErqVc6iRayAVELas7RiPD2QJy2piQHl8TDX1Sw6PEQJyDq41VblwWyHW_MgxN96Jy4FjSGYRMX-xuRA3TYG9zlZzmU-OWwvMGyCeevZdEmZR0IMH-hzoTYkywv97GqpHS9zmqeXvyVW500MkLu1c0C1YqZONyaY7Q__EHW-dDwRDrZFZwbVtZtj-Aj4tp1W9IYT4NevNbr4m5qTXkG5lD7jtH7DNwnF3Sy4GQ63_oRjVtZxAiNXYswq1OUvBIDP6l3pjrk7N_XM5c_fkDvA59Kla3WKOLPs",
  "reykjavik": "Aa-ngMbk0deD0Ok5CypVq88a0TAd4hNfLRkJBGDu-Afv0rUaQEm-gU3OxRhwlLpSR24kI-B-pY0NxjL_X0-de9txnGAoBvszG7KDcPQbm5J0zuz0Xyx8A6Sd9IYhYWRPDi0ghftvjz0oUNW7V5rbdlfI_JQ2hrdjmGdNlY-5GYT0B_YK1kpgyeo6WaXKk3RXPUDLuX2ZBhwBw8RwQt6fixlCtpqvkXD9yxC_rqu9jko73zoxRPqxzsKBmhCO0IMnLuuF08DHmIHpW0YmsJ5Ip4t0hxecjpWNan5i8C2xlRF5cNJAoFENVqz1EpzzbMO-aY5p1U0EaIo8aFXJdrvXih7q_U667Vz1G8TSLvo8dl4vmwbYvWC19F7gO433bti-SgPx9mja-wNJn2r-dJSP-FS9ShYEFLoEiGA",
  "gdańsk": "Aa-ngMavGZVeu3lK2wPP2ZyQV5XspC0AbvxPGDiu9Dugeg6WUHLTpQkjKhrepcrnB2RrgztQeeQU7TKDnZ3wydscMASPExgq27w8WotEJbs7Tb4EWmME9ryDhGa2sVGwPdNGriCVCtBMKKH8ECWASRFQ-fiL9ELXPRiAPkc4QciDiPBUORvegMmvFzPUHu6_hbVyGM48ZPMZqRl0S1UPa0xqglhg23SglMCRlwpGR0JKjxxke2iutrKPLjMCoGEsloCz8eTIUNDDr4n8jnRe3txBtmO0rXiR2j_wiAT-k1ttelaVMqnLVI1v3sva8p28B7wJl3Su7yYtJ9CCd3IrH48MFwUKPZxzdvgy2Ys7jlWKnEsnei2x4m0dpIu70Jbzx6tVDjWkp29kVeXdMDODso59o7y7pDE",
  "wrocław": "Aa-ngMZbejFSGNB4T7AWWukEcs76Bntb14PWOCFBF6p7TKsyk1sY0_NEqZ1Xxd1mmXfQoLlZmWTHXwu18F0ifct0YeWpy7hUUx7DbUSx5OegtpjKGfCeHVYFQg-ShYja4Z_E-MjNE8bfdu0nJ50kqB_x_MOg1Aq0uW_aA0jvhefDAgKC2HMttwaIgvzhHA928tB4LP4fRRF5pmdn5wA03rwy2Kf5h-0NWUGCnS21lRomz2DbvEFjO6MiD8EholDW986njx-Sj23kM3PskJaPEOkd1H6-imi9JJj0SYVDkcu6Uab0COJugIXxrhE_gxhHxG8Yaz293xMgK8IWBW48Txi7VV4H6l8VqTQOSvy99hFNTcdUZ6xjRBqOqZHDmXpcfIR6s4o_Qyl2jUb5l3-L_HfGnoUWPSM",
  "bari": "Aa-ngMYR6pVfznRS6ALSHWKCOb6YFIkLsV8wt4uYx71VmzJd1PVw_NJZU9PEFVOhgfzN6urWYVkIGzvNwiK1zmQy7wi0u6bm2otdaftWz5xozbmfpaFRp_TWmEuXq_XtQ9OGKg-w7kP0MUke6qKz7FKnhLlKY7MzyY6HdutmBlDDrTui1XQQwypDDRGOtL6FN_ZzM4sfU5ykADwDmSg_q1Km44pV-bMdBtejP4QzjhGLTZfTlu93yW3Qlh71zBsJ8hZoTrznyWNwZ2O5dj7CgN9bx-EXGNXHEjwW6vR1zFh9fuyINDj2ugtBB092G5kyQiQtnkmjOA4g0YUnv93NdwXprWszfpp_5Of_VWM1Sw_dJLbHqWlcFYAyaXHxmm5JlD4o8VCtNAdeqbW2ZqLQTKq07l8AATcoWxWLFDgvPf7xAvnJO3it",
  "zadar": "Aa-ngMY61bsXVYgtNbFCEkKGdQPRGxdSlvsAy8Ko0JuFmY6A0Pt3cUlN6UHSfs5-zswNXiL1RE7uBaOxe8xPoV-DuTdZfJkblQ1mUB3Bp-qbTqeJCK2N1KZ9YfQd3bQIZtok9QJaoeaPyJx7GI0vwaI2BHRmd3W8NerCR10R6hjT66t7cO6IizBcpPZRwdNRIO1MRj1U_4B_7gW1AroJCcFOJMeP3wStsYEdlJ4nuTN60CjHVXHMJ5twrDwQN57mJ3EccObYHW5NttElKPvX-9CzUWYQrKv5fJQeMVvvFlPw5M7qIB_dM5fFwE_Tjc0WHCUipVykuyD6ts3Q6nRi57VNoQkmEboYlVf0m_BalQKDdhnu7LY2rp-lnFJ7uubwl6bmlcQn4KswX-xXIIUnl7GRayIQgOkHc7c",
  "bolonia": "Aa-ngMaAfYSy8sf74DXbF1KxStLXwHkGSE0qQQY4uBlt6AZWugYdXwdPAS6Pp6aDNGdk1f95y4yJut0nCGp0m5Ao_7QgGWCzpmZj12GNkkGmqc5wrR0teXjJFsx_b2SMVHvgXcJuN_U4bcZDy7bU29gtWwLf4xYlrs9GsIdHMGDtiHSZryofISDK169Flh_5uXWd0onEuzdllAp-0cTCvsre13P4ArW4BKwG_a4oNyCkNL6VaM8z8KjZSd-W4LVb5TXRQ3gpidnAAnv_NWHSKCZz7EGzRI0khyz0aFq9s28gok1qGSaly5IIXWsVH09vHAVGaPEm027RmBz5c2KVlrGxC8zowy28aWDxfZWFgBVgN_cPN1iBig869odx8YQ_t5Zb2pDbe465Rdt6Ca5V1C4bXHgwyE5foYpZKB3gnpCeC_SVjdDi",
  "alghero": "Aa-ngMaaPTIjHyBUG-2ERyRRMluv-g8aShmbWhi30UFLD4knTK54jEovbPYYpA8y1PbT9HmcO839upsPKwySmw1ZcqZtVaNAZRgHdc3-PM0GIPfCi-BAQ1-FyS7v59e7OQUtn7IxdmsOqCGvmwmVp_zMDc7gHVcg1ssSxOYfvBlQCYwa041Sl2XNmUpAFOAaRMYGZAp6nAKqM7NpRb5jeGK42YkrO4Pi5NCIOyLsiLvthJip8sOyM1PC6eN_1XbiEUcQmsEHf49Hs3xPSRpTlksJHb8B8Ri3ye9mIw3tTy1jq8kwBgpBvjzNAiOe6yCHupeSx7z1sxzJ5Eh_iSfAHUd7WOjjE1bOf3p4NXGZf5etJXhp-Tpa_HxMko0_q8kFcdxgDmVbxxywRZXeyL8wEPu6I1_PKDM",
  "kotor": "Aa-ngMZSx3UQjU8MYezdUDr6xxqHokNVFFnq6wch8GiQnpY5Oa0FRCu7hVH5qYRoUucdE0ShJK6b0tHM_h31gXyc11D2x6lKhQAR35TGiFCB2l-BeRnjcjL75oJni1XKqVM9MdbZFp_4oDOSGDJ2ZaS3idCICh_uR7tTEsPwk529hc8HQCr3A6Y8X1A39wNw2NJc0Zh_5EfcHmD-r5VQyZdkUA9_k6uEHT0ofzVDyuuTu-GOObCnvdCEY9nEsXNghy4nbAZdqPXjKmTON3oF1CX4N0kk4CfHi0ofrKC-ulQF6_DiZRsFd3A3lfeQAxN0dHzHlXLmMUUOd_L527azKU4IXfOw4DGyvNdy4u41dY0XhSr0CTfLEM5kyAeSx1OHtdW2JwQxxjRrbEGCFUt91Hxo1XwnZ6t94pJWZI57mgssBwc_UZA",
  "lublana": "Aa-ngMYtY_FOQw0czdEYZgS_iJMgOQO3zLUe7UOfw136islc2mbbCoo0yokQvrQeU9nx1hfLMjitVznUXqIi5S8e3SmKCYsVN-YdmRbSGnIkEd0renTR21e0FaRfRoRScKP2DMtqs-7aQK8hLzXBB5jT4aa1J3fskBLM8hfmeHQ5S_otzyRzev2fMnPrxDiiEL6bmNQ3GOukTc0km2BMeD2zSJkz4s6kiHVhseEfnwykxkNvHK46UfSh7jkfQyyY0NfJ-XTf8pMShcV3jmOIfJxVmBoqH6wGLq-Achb5Re2am5TGYQ58NFX5NQx4P3PtrO67mcRy5p7RWALsFSgr78tVpB_PjNCUgdRUy5AtQOfpZs5obEmNWvRxS2iMeWntoHscyoYD8PAtxzUxigSh7kfBPrhCsgQr1ZIqmOjZDbqF6Z4",
  "bergen": "Aa-ngMYKSE_j7E3h30glnqNq4FyIUB1vpXk1qMrfuhpre2o5Zeydm07_cMEcQaruB1fhO7dlvtujEUR5ilb6kbgL4CXl3IPoLtLSj2zeFvc46c9ZSlbA8hDAavXYIdIKY-uppolLYvuKkb0XHoUiqb4DP2p9in3KnQTtR-vL1yUUrQXUaszDadcQqJrDlVfE0hfzRcS2x3XiB_yzecZf4RoGg4PQU0c6HRQ_eBvdHeHiDGOJbIf5KApisRNKgDh0cjKHOum1CIxjKpfNS62rOV_sWT4cDyEIrfDEJwJ_y1h2jZRfgPqGAag7HxrdTiWcYLFRA6uzQjMBXUvBqISjWLFliAAsct8zGkIK2uPlIp71yRvE0sm-B41SdF26jPufYieAUkgAfd5JVu41JDVnYt--d60f2jhb1YI",
  "colmar": "Aa-ngMZOUVmGDY-TBCxnj7Q1K2nxP0HOLKxQba6I3lwXJP4M2TwDhfkYJk8WhRdVP7t81KHTJcyK8mqTIDRO0EPHfxqu12joKEuyVbq7LDwunqgiNIFnkC3IJxs2003qjOiqLhcJMFTx_VqfPXICxmt9eGj05eL-iMVSs-sfXCbAmy8gJGOL4j6BVEeZ4ZVEy63xmBWErRwyPrL40rAwbkucuJOCgB0d4arL7jS25rNIS2PuljGJAkqseAvX3yx-xgIHynp2CNN6B0gR9388vtrM9B7fy6P6IuesFeG7prXcwE6BbuHWQMx54O0GUOL55peVWBULd8iDXAM8ldM3DVUaDPBhIgaLngqsBeRscSvuFi6csRPkwNsy7u-sRPCxLVBuyMcxlgCE-A8p3G5qz_Et4rtVPd1Ya_dL3xktOHM9vM2QRNUT",
  "sintra": "Aa-ngMYBhHWPCRbReK-4Ufkm3X1zCC0oCYwhIxcXcIMcdmrRxJlqKXzMOhO9dRxDVDIXjfrcVLOyzr54pR3CtPJj98XCWh6RomDQi8-AiQLA7fTZVVLVfMtYxR0U7ZGUVIGyZlam7zPkaaUDM2iGRbHblRxtcCPktTkOX9LJ7Am0h7qwQ6AnNaqAHA4ywG6CCblvKbvRACwNbIJkfUXJNd2zdrH0AE4DzwezL8ZawNhv1kP-J13Or_iPt2NMkaJI-Ym9dBS3zboU8OmOz4yk9EvBr2z_cxGPFc1VXxvvJFFJ3k2j0DVWI8942eBxsLjx7Acbdc6SRk-0Ek_NE3GUiTKN0BTlAMfJ3yi3nnXxW7nsTArMwurSmWvOMGiSs0j_bbXhexUcyN28UsuGRE8KsxpcV-i9EsEsv8m6bWxEinnGh1A",
  "san sebastián": "Aa-ngMYHqj2Id6IQ-gbzhS5jUPHxYvvytoYFclOWqPi6MU9G0e_JOs2vTNPwToQoR8N1FXic_YRzYxzbDODQwKqCx58szVfuRKUQf9C8l4MS1-L5HHHHpwYUoh3X5Ru53xHT1HtaEFgcEyMPal7sTR8Zfpb3hnKZW6iu-uvknLpEua8mIkMNYnt211lpS9NfMR7exMlS1TXuWeBjcAcH6b7QFxOe7D1ZI-9mPj9TYovbVWOHK_aSNUOWFfbhbDnUOYibBVv5TpzAZW3XI6454MQxMBdYxBFGdMF-a_y0njd1pZ1G1P7-aEr6twBKxeRkra_jWthasT8W4TlROWgo8w_4N1nDUUpg0afUJJKSU50I6uOSkp5opO3D9Jxahg6IuQTUsNOCWNs0EHzeT43nF9pGKeoGoScymXafqiebCsEiLTqncQ",
  "tallinn": "Aa-ngMb5GfIkvBaVwdWgeZDDu5b9l5X-WQpXWxxVZGa-KIF9WR205ryl5N7ab7uaH4bzp6BsKqJ8QgLpvIg4njr1vX_2HYZihKf-a6GQjL1CXgY0HmnKWl6ZeQl9EXFQXDUUH9AmkfxD8LikVxQdVL3IG0pQqxfkAv9-VCMXE7BSNa7hMl010KvV3cIybhqPNqf9Blx011KvDJdiTDXOrcSZu6EovZRQhz2I90uvxIdE5v3bvJEsrLqB4jw5eefObq-yLa7OPYeQvK4Q7kgPHs5dzdrg819WJBIpR23nU6srjJpnur21ysQcLH4wCDPzJR_Z-6NOu4-e6DCLbxQGbwvYIR5UOXteljMe4K8DoviW21EpL4EiTCRR82C-3s5wKnrD5XF1uHNKdAhWcLHmj_4c2y0FXC0",
  "matera": "Aa-ngMa-k7RHHPgtO4O5vt-NYx5PPWTnnieJUhCogAiexmBRuvDrN-02gsEIggMe2ZcDEa5v_w-YgAww5sY4cIC0DxQ57cRpMK-chFLitEyrlmsNmK-p2kcEkn-IzDh1h5WVjtFfKK0qYv4NsulwoCCYPMLcyXOvUmY1Fbf-Duq8htrVQDcjaxYwGE-8XC_yFwveezfNSdYHzfC2WiHmfC90Vzj7hGC2ZR6ZrktK-Bdt61IiNfQzjp7PcLiBN_lZJ-tpcF5dN_0AfWkhFGWybAQP_NlWRxwvNd7V0E86WJFX-sgFpLDRmsEFxw2zRyNPntLaS-zRGr3RK_3k7O0J-l93UyGT_Btf1RsQ5FfCZ0s4zclRlfo8NDnwAjYsHpobnYLF-mxWBu1FeUiVpikmECsXg9PUGyGiPNZizIEgUZ0gaeweIB-k",
  "tromsø": "Aa-ngMYu7OYsFrelIlrniMQUn0pJLj9rtgtheQTEOhbuPt34Tomsuw_1o9a17WImIbHpMetP4KBO0swTnhptHStikH0lzOLF7CQ2EVKyXkG2MyIg65NEtkPYZULGTeS-uG96AsBPwXWaqHg-Gic8PYy3V_kjQl3tNmlo3tGAEkw8R8FRmiiRl5mjydxOpL7-lybzZWwnyGpbL_mc1ZM4o49WCbacmszAgb2m9ly5G4t7UnV7k8cyr-H1JfKtrU1pD_0cicl2wCFRMQqJPMlP26Mby0tsWJbNncyQtj58qbyEN97CpFlPqmWJb9V1DOz2_JaHCH2oJfUo3_1cyfXUQ47e4YmWVNp_rCK-I8hRqlnHzD0rMWJHEVKIHJzNtu_UtMAkSHRdJYNVOnOSnPVFbCoHVXyfVplsmzY",
  "ochryda": "Aa-ngMb2c1nK_PHEgImVCnchPmoYkOTIwUaWzi8aQB7GGAe9rhwlIg--0HAQuGg6AfQZ5CuuC-JDGgY_U301HNqFM_1OUTAyvDWxwCbO0HtLJp-USpXvzVnrfw_6Xh_zQr6XZC_JlF3Azjv1g4IDdB4SU8KdETVMJtR9Yht7hT8VHbJtWGkZVL3ase94Hc_24HlUuReA-LKfY0bD5IvA6wFz5792G2bvekQXWyhN7H0lSNDFXdO4O_KzA2r9-xjHI_Ee1pZ4d5ILzvBz-6z_nG4cocAjlmi-MHJxc77T9k8I4aHCU10R-_EtXTOgeyUqe5SczSuP8c7PsuLTMeZKzyQ1ROEScfgu-QVBkcpve6arkr_IjCuXgsdlgpL6-Y8r2OAX-ZI8cLHQQCzLp51rkPjC1hY7AMl2uDMVg9vRdEV3s0A",
  "girona": "Aa-ngMYXl-Xa5u6zlPxbyk8dtcNPbBU-5pHfWmKXHQ73660UA0tnoGqI7ncwMVZ43-2vqYD5_3uZLZjyz1HvKx7zptx3b11IYNw10JrthXZkQ4vTHpzoV4ED6x3B7O6Qwu5w-yX0irYyAUu5_zAKNZOZBqSGEVtrz8qh9PHm45PzzmqQBo314cnl3jrbYNrxK0T8OMrMyXMFqJAdDeinUJ1hFJF0ZTUi8LGKxPcwE7y17Ee-rRqBdFm6Wn6tOKbGxXOBIpHO0AV1yW9LFfJTuQxjXY4QrWCmrLHwrmj5VUgNb14vYaLMwtUh4e5mkB7YShASwoaU5yjLqt8netddCImEvGaWP5SawoZFFiQhobLgYTVhI_kXSsc3KuLe6HSMPrLejtfW-dIeZwMenwQXq5FtaLNTqBE",
  "hallstatt": "Aa-ngMZhYVLHeDVH1lVwW7G-DXwIbUYmqtpjbaRoSdPjcXh6gBjCWiAlHOUgHsKvH3eMWKOFmqlEVx_xfO1Glz0ntt2c-d8lWwBwmlYhZw3Ll9hAK6WsVkRpDmWifarq7jZvE5S3tkh__WfQIjvXLxxdLd5RKR-g8AnloBO_4q6bWSuzRZxwWjVnKqIiN6pxT3K0i38jcPXA94zuGIazuCOayMcA5u9gwmzJuH1DtS3EmIJAeTRuV41_9EnwucYKrHbhBdDcEQ6Yjb_DFIt6HyYcL5EkI43e8geSDrfj_TuFD32mJGJ-WZjP54b_oBwXWjNBOdEvmOMutTjJd8GxtjN-qHwjH4taZNeND-62xHnFmiez-N--Tp9_MvizkBR6kuFNF8M1lTjpxY-O1yomYyO7LhdHV5nx9QogHNC_89LOvMi9fks",
  "brno": "Aa-ngMYbsFm-P2k2cTIv6ElbOOo5SzKsxTaKDUPj4BplEC0g9sG-02MhXKnddYR0k4hmcS72mRGfx910Tis2BoYzhT35YFx5vHrE44LK5cByKWpVKGnAkpV8u5rXf8tM8cQmS9AMxFOpikmIaMxUVXLPtUrvg8K3qufi8J_sslrOqDyxQ_BN6R7zyO2H85NDmF_UJc65S5uxRNWJXJTsGD80EN8zaQMWPOPE9fF6G8wOWQpi8dKpshS7bAbvIFD4E1IlXj1vW5N1OrqzFtE8vlhJSEXKaMNglZqeE34LJzZzUw01iHWevC9EQMmN6BE1UNWI52I7tOaWety_K2T5Lgl57NEOLej4gwqpIhQ2e6FYtx5RGRuUTUrHIjzr_vOeYDyewHgkzPc9LXLGUlcj7J0J7NRbb7TssC6AkZ9ruAqW9RSY9A",
  "sandomierz": "Aa-ngMYTc5WgG7eFNYOP-uIst-ZGFJFk9JTcCAMY1-iXXMe3abBzAaLzy6U7U2-BmtCbtXoZjIQuOc8x5aUgxwopFJl_2Fj3afXb72Q5FjMieLqvPjIATkyVKGpv6qSrbqg0fE9LS-IAhZ9iQjILdazCP74ejpSS_frqMaD16cOq5krl98jNQCDUu0aO5nJsJLBK-4uTLrP9pVLH9sQvSIcFGPf5bwiQyp2wBAAiJppa4j5mMNDhP11KF1pqTa0JCfp-ufLVlDiitsvAriPZp0xpwa9lt0uJOnJZ0pkaHqzPGcZhc9RakBGj-7IbDN-QQhy8XNRIV1PXJLKGcRdKAOi55l9zkun3xz9cUopYuOZZPXWYySdGBQlT-SOFDXjYNoWXZ0GdAGnQEL2ur9ordfrLe8E5fT_UigY",
  "szczawnica": "Aa-ngMZlSMyeSGJ6HrkFXYX8V5LzkPNeCylcqx0Rshfv7XZ-fieI4zup7OQfR3NyLOLSliG6F8uV7iF20nlUrtVdN6kfcuRdw_JyRXD34DaGr9GP2YaqzxtIbzUol_WkQP3iLQlKLjN1OfVj_XFepd4T5WrD6Mcsd0a0-cSJlS2C6d-UxUJLJmrHsP9EAe6QwSOW6gPQkP5wfv1T1B3DeHzRu1DvoU8CHmYWxCj3QWQRxQw5R-CNl90EFNpBwBO8DZfPACbNg9voD0mCfBNLDu3P3WHwxDkJbL43sMod51jlfSxXPper320FTwLWoOe0W2Uta0tssTfNwTfjkS8attcThYFek8sNHVQ2kJOj1bo5mN0OOsf6PC7BGsy9ksscKvWr63T0KFbGn7-iEi3Vty8eQEstpRvh",
  "zakopane": "Aa-ngMZMHxKYL9G7aRjaoQMaI-IsT_YJtbs3SZmlXbpviKEv8YMMI1FHAZC7SCHux5m88doM2RGD6dLgMpDsXZG9tKdC5U5l6vlSl46eZLcSDyBY-YcXKoPd0yqLfA8tFAzSutSVHCmroAZsnXyU6b1dlDvOUtOR4qaK_GEkGkB275yxIi0-KNQRbhbiFND5D8vQzfCp6ZDi3HGNOydv2ldCfy8zflO436J8b9hPIBtF2fJoUazoWK-n7JFXPNpo8PhVVcjIu6NqiLrz-wJo2NHBgo8DWTaBs2aep_V7EejJIUmj4Dj0i5GQYEzRn8NWFMrNwwYc6KIHIwhjHxLAllx5nZiAUh3TauNSQRgnEYY9dZabHvb3EOcXnGzeWVBJKpFxe4ciCgnK-Av3CjtiDC3Ws9OHWf4",
  "toruń": "Aa-ngMZ3WjteK99zOXd-0epKVI31l4PPTo1Y1T58OZ-UR1hyFsOH6tmDG4gkr2x_T4mmLWjUn-5hcvmxDBu1HrMtEYskLnZbcZaZwXPZWNo-wfzFge5Gj5OJoM9zsaSG1PuMzLaJq0UWDeWE0UyOWmNqjvCZmnB607AjK6eCuZscaNuUzMVsLOAzJQKCOUsgc3gaCn9I9Xk4qydG5uyZ_eWg2-mfNIwZgn8sboumHUpXzm-JHwlTtDSGM-tmEk5OevrZotsgqpHJykjVAj9uuC131BDCUbxgHYXUwHYXxRA4IYxSZq2-Kq8_JqNIzgrwurSApSvuwac6vSBZkuubhYYbzTtMhzLkk4jIMX93p4spaUTZxH8aITP4x6hbD3WFjDPWMRzw65ZWwPgHkG3SIo0kOHVJxM36",
  "poznań": "Aa-ngMbYo4gbFCk_rGR7qesTaRIoQzYGi8fQ747Bv6m-5s8HxcL7kVx2_1DBTxW5QuqXZBENYlQdIQnWK5KTVRLdiKkYhbupZ8ZSPi-5EAN-5IEcnU2awW3kefiOx5BrJP8Y6joaQJv0CwVDurGGeUnZ7FQ0FVO4y7TBkaulQniX2DydAyBpKBsk9klzuWK5qDOoeDa4dcBKccbnqG7u1mV-_XfgROmCxVYP513DkMO_tL1Z08Y3_vllQSbSD7rYwJNTGsTTQ2BVkj5pB9Q_JP_8of7KKeQlWbiNBv-A5n-GVGeTs2yezlXrHJzu-Vz4v5BzNpB2tecqnnetFTDebtxRemSpwJMXLIt8XULOWmzuwVR2suMxmEMDYUk5py7Bz7vhTwnoPozo6P3tv-Ifh0B67XAlq57OlfkCiibZNMr1Km359w",
  "salzburg": "Aa-ngMZSg-CyiS0dCcZ9yYBKw2gw7tlZ-P6GUA-6ek-kH6Oim3KqGV6bABh8F3h8DDM_eeVTZSReh-S2e9nEezbKBg37iBzxLxCESqG1Rx6_OWZhz-fVGz-QLa8n-lYIeLE0UrsbdRVcL3Ka_LvkDuGtpJmWFa8-LEsgQgH2N0FRhXPsU-ddH5yeJDRGS5lmQnDK0N4SqBPBDj5ZZi5HXb8oj27lBL-7EsXBWhO-PRayZo_GAe1VkkxUSz73k4oeYVJNxrLpwlavgun7SM-0Lyl7xM6fOQY705mu2jvhKrSvAtKGxXo_SdA5a_drF9TfJQkeOQvraMxNuWHpM6oSK_wjmYOLHI1CKAnYroWobl7yTN05fzYFzUJ9EM0Bvm4O9UrZkj2hDQdwJ0T_I47EE3WcObiXrUA",
  "palermo": "Aa-ngMb8zAsd_YGqemhTmWUMhA5ynRD6I76UR9qN17RuysKx4u68YJkDvNQDUODTXdD8CtKkAW4I49chM16SLBRFIlZhafLsN_pIXyigjNzEMeueGQZ1KiiWit7B__alX2MrXUr5RVOvQ5fFws97ndSeoICz1K60JIUCRzatjngAbvvXAmOP_-U3XUrvsWdOWxOFUIvGlSAIdnVv1wEl-VMxcPEBQ_8EqFRI1cashgMTki8kUswnhM2V0UW-CbpDL94nKd7ifsWqmYtpWgL_hw0C58xSNlv_wjzhNKbQKdNOvQ2MXwzqgSgFsi8DKgbChke3YMpwwS6PC6TZGDe1bYa9GgeXEsoKc42mSfBaP9IOffH36D4LHaW4N_YRM1d--xikoqa310-gNrkx-Ok2hrB6FmNS3s_q",
  "sewilla": "Aa-ngMYZHMuSMyzzjzyE0XLIvzABOFS98fMwMsr8ks_7o2hkuuTB-HQ0HpjLQVGhZFdAjBB51sH-P8hQ4pJfJLvXDXkLT6vxytPAGm8jf5-3TIckre9cUzaqrL_UD54LROeTGue8DPfws6Ngu9EWemXWPj0syAQiHSfj2rqtcaAZ8MGREy5V-_HfgemLcG_usTsHyqKIfijN1DJUwCQYNtS1r91K-vKzQ5z-UpH8s3HeGW4AZxEFGJzKbtJVap8PYCM-oXym60DVBwfMHD5zVJXbNollVy7o-QX6jbWEO5yVlA7KegeqDRJavDiLDWI5SBozTOZMKpFluh7UCvnFCdysbKR7X0pGJsu6xrq_Kxer6e5yqSL7VJmY1To-5sJYu5UZu6_Krdkn_qNwPifLycnq2wLDooiVFx59_ToOz4smxFRZbjwi",
};

export const CURATED_FALLBACK_URLS: Record<string, string> = {
  'kazimierz dolny': 'https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?auto=format&fit=crop&q=80&w=1000',
  'żelazowa wola': 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&q=80&w=1000',
  'płock': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1000',
  'ojcowski park narodowy': 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&q=80&w=1000',
  'zamek w malborku': 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&q=80&w=1000',
  'zamek ogrodzieniec': 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=1000',
  'łódź': 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&q=80&w=1000',
};

export const CURATED_CITY_PHOTOS: Record<string, string> = {};
for (const [city, ref] of Object.entries(GOOGLE_PLACES_CITY_PHOTO_REFS)) {
  CURATED_CITY_PHOTOS[city] = buildGooglePlacesPhotoUrl(ref);
}
for (const [city, url] of Object.entries(CURATED_FALLBACK_URLS)) {
  CURATED_CITY_PHOTOS[city] = url;
}

const DEFAULT_GLOBAL_PHOTO = buildGooglePlacesPhotoUrl(GOOGLE_PLACES_CITY_PHOTO_REFS['rzym'] || '');

export function getCuratedCityFallback(destination?: string): string {
  if (!destination) return DEFAULT_GLOBAL_PHOTO;
  const d = destination.toLowerCase().trim();
  for (const [key, url] of Object.entries(CURATED_FALLBACK_URLS)) {
    if (d.includes(key) || key.includes(d)) {
      return url;
    }
  }
  for (const [key, ref] of Object.entries(GOOGLE_PLACES_CITY_PHOTO_REFS)) {
    if (d.includes(key) || key.includes(d)) {
      return buildGooglePlacesPhotoUrl(ref);
    }
  }
  return DEFAULT_GLOBAL_PHOTO;
}

async function hydrateCacheIfNeeded() {
  if (cacheHydrated) return;
  try {
    const raw = await AsyncStorage.getItem(CACHE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.entries(parsed).forEach(([k, v]) => {
        if (typeof v === 'string') MEMORY_CACHE.set(k, v);
      });
    }
  } catch (e) {
    console.warn('Błąd odczytu cache zdjęć:', e);
  } finally {
    cacheHydrated = true;
  }
}

async function persistCache() {
  try {
    const obj: Record<string, string> = {};
    MEMORY_CACHE.forEach((v, k) => {
      obj[k] = v;
    });
    await AsyncStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn('Błąd zapisu cache zdjęć:', e);
  }
}

/**
 * Pobiera oficjalne zdjęcie miejscowości / miasta z Google Places API.
 */
export async function fetchGoogleCityPhoto(
  cityName: string,
  countryName: string = ''
): Promise<string | null> {
  if (!cityName || !cityName.trim()) return null;
  await hydrateCacheIfNeeded();

  const cityKey = (cityName.trim().toLowerCase() + '__' + (countryName || '').trim().toLowerCase());
  if (MEMORY_CACHE.has(cityKey)) {
    return MEMORY_CACHE.get(cityKey)!;
  }

  const apiKey = getGoogleApiKey();
  if (!apiKey || apiKey.includes('TYMCZASOWY')) {
    const fallbackRef = GOOGLE_PLACES_CITY_PHOTO_REFS[cityName.toLowerCase().trim()];
    if (fallbackRef) {
      const fallbackUrl = buildGooglePlacesPhotoUrl(fallbackRef, apiKey);
      MEMORY_CACHE.set(cityKey, fallbackUrl);
      return fallbackUrl;
    }
    return null;
  }

  try {
    const input = countryName ? (cityName.trim() + ' ' + countryName.trim()) : cityName.trim();
    const url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=' + encodeURIComponent(input) + '&inputtype=textquery&fields=photos,name,place_id,types&key=' + apiKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();

    if (data.status === 'OK' && Array.isArray(data.candidates) && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      if (Array.isArray(candidate.photos) && candidate.photos.length > 0 && candidate.photos[0].photo_reference) {
        const photoUrl = buildGooglePlacesPhotoUrl(candidate.photos[0].photo_reference, apiKey);
        MEMORY_CACHE.set(cityKey, photoUrl);
        persistCache().catch(() => {});
        return photoUrl;
      }
    }
  } catch (e) {
    console.warn('[Places City Photo] Błąd dla ' + cityName + ':', e);
  }

  // Fallback do zweryfikowanego Google Places photo reference
  const fallbackRef = GOOGLE_PLACES_CITY_PHOTO_REFS[cityName.toLowerCase().trim()];
  if (fallbackRef) {
    const fallbackUrl = buildGooglePlacesPhotoUrl(fallbackRef, apiKey);
    MEMORY_CACHE.set(cityKey, fallbackUrl);
    return fallbackUrl;
  }

  return null;
}

/**
 * Pobiera prawdziwe zdjęcie atrakcji z Google Places API.
 * Wyszukuje po nazwie i mieście, a jeśli Google zwraca zdjęcia, pobiera URL zdjęcia o szerokości maxwidth=800.
 */
export async function fetchGooglePlacePhoto(
  placeName: string,
  destinationCity: string = ''
): Promise<string | null> {
  if (!placeName || !placeName.trim()) return null;
  await hydrateCacheIfNeeded();

  const cacheKey = (placeName.trim().toLowerCase() + '__' + destinationCity.trim().toLowerCase());
  if (MEMORY_CACHE.has(cacheKey)) {
    return MEMORY_CACHE.get(cacheKey)!;
  }

  const apiKey = getGoogleApiKey();
  if (!apiKey || apiKey.includes('TYMCZASOWY')) {
    return null;
  }

  try {
    const query = (placeName.trim() + ' ' + destinationCity.trim()).trim();
    // 1. Próba findplacefromtext
    const url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=' + encodeURIComponent(query) + '&inputtype=textquery&fields=photos,name,place_id&key=' + apiKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();

    if (data.status === 'OK' && Array.isArray(data.candidates) && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      if (candidate.photos && candidate.photos.length > 0 && candidate.photos[0].photo_reference) {
        const photoRef = candidate.photos[0].photo_reference;
        const photoUrl = 'https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=' + photoRef + '&key=' + apiKey;
        MEMORY_CACHE.set(cacheKey, photoUrl);
        persistCache().catch(() => {});
        return photoUrl;
      }
    }

    // 2. Jeśli findplacefromtext nic nie zwrócił, próba textsearch
    const textSearchUrl = 'https://maps.googleapis.com/maps/api/place/textsearch/json?query=' + encodeURIComponent(query) + '&key=' + apiKey;
    const textRes = await fetch(textSearchUrl);
    const textData = await textRes.json();

    if (textData.status === 'OK' && Array.isArray(textData.results) && textData.results.length > 0) {
      const withPhoto = textData.results.find((r: any) => r.photos && r.photos.length > 0);
      if (withPhoto && withPhoto.photos[0]?.photo_reference) {
        const photoRef = withPhoto.photos[0].photo_reference;
        const photoUrl = 'https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=' + photoRef + '&key=' + apiKey;
        MEMORY_CACHE.set(cacheKey, photoUrl);
        persistCache().catch(() => {});
        return photoUrl;
      }
    }
  } catch (error) {
    console.warn('[Places Attraction Photo] Błąd dla ' + placeName + ':', error);
  }

  return null;
}

/**
 * Wzbogaca listę propozycji atrakcji o prawdziwe zdjęcia z Google Places.
 */
export async function enrichAttractionsWithGooglePhotos<T extends { name: string; imageUrl?: string }>(
  attractions: T[],
  destinationCity: string = ''
): Promise<T[]> {
  if (!Array.isArray(attractions) || attractions.length === 0) return attractions;

  const results = await Promise.all(
    attractions.map(async (attr) => {
      if (attr.imageUrl) return attr;
      try {
        const photo = await fetchGooglePlacePhoto(attr.name, destinationCity);
        if (photo) {
          return { ...attr, imageUrl: photo };
        }
      } catch {}
      return attr;
    })
  );

  return results;
}

update public.vehicle_models set brand = 'KIA' where brand = 'Kia';
update public.vehicle_models set brand = 'Mercedes' where brand = 'Mercedes-Benz';
update public.vehicle_models set brand = 'Byd' where brand = 'BYD';
update public.vehicle_models set brand = 'DS Automobiles' where brand = 'DS';
update public.vehicle_models set brand = 'Jac' where brand = 'JAC';
update public.vehicle_models set brand = 'Lada / ВАЗ' where brand = 'Lada';
update public.vehicle_models set brand = 'Mini' where brand = 'MINI';
update public.vehicle_models set brand = 'Seat' where brand = 'SEAT';
update public.vehicle_models set brand = 'Ssangyong' where brand = 'SsangYong';
update public.vehicle_models set brand = 'Xpeng' where brand = 'XPeng';
update public.vehicle_models set brand = 'ЗАЗ' where brand = 'ZAZ';

with brands(brand) as (select unnest(array[
  'BMW','Ford','Honda','Hyundai','KIA','Mercedes','Nissan','Skoda','Toyota','Volkswagen',
  'ARO','Abarth','Acura','Aito','Aiways','Alfa Romeo','ArcFox','Aston Martin','Audi','Avatr','BAIC','BAW','Bentley','Brilliance','Bugatti','Buick','Byd','Cadillac','Cenntro','Changan','Chery','Chevrolet','Chrysler','Citroen','Cupra','DS Automobiles','Dacia','Daewoo','Daihatsu','Datsun','Denza','Dodge','Dongfeng','Exeed','FAW','Ferrari','Fiat','Fisker','GAC','GMC','Geely','Genesis','Great Wall','Hafei','Haima','Haval','HiPhi','Hongqi','Hozon','Hummer','IM Motors','Infiniti','Iran Khodro','Isuzu','Iveco','JMC','Jac','Jaecoo','Jaguar','Jeep','Jetour','Jetta','LEVC','Lada / ВАЗ','Lamborghini','Lancia','Land Rover','Leapmotor','Lexus','LiXiang','Lifan','Lincoln','Linktour','Lotus','Lucid','Luxeed','Lynk & Co','MG','Maextro','Maserati','Maxus','Mazda','McLaren','Mercedes-Maybach','Mercury','Mini','Mitsubishi','NIO','Omoda','Opel','Ora','Oshan','Peugeot','Piaggio','Polar Stone','Polestar','Pontiac','Porsche','RAM','Radar','Ravon','Renault','Renault Samsung','Riddara','Rivian','Roewe','Rolls-Royce','Rover','Saab','Saturn','Scion','Seat','Shuanghuan','Skywell','Smart','Soueast','Ssangyong','Subaru','Suzuki','Tank','Tata','Tesla','Venucia','VinFast','Volvo','Voyah','Weltmeister','Wuling','Xiaomi','Xpeng','Zeekr','Zotye','iCar','ГАЗ','Другая марка','ЗАЗ','ЛуАЗ','Москвич / Иж','УАЗ'
]::text[]))
insert into public.vehicle_models (brand, model, vehicle_type, express_price, complex_price, detailing_price, active, sort_order)
select brand, 'Другая модель', 'crossover', 450, 950, 3500, true, 2000 + row_number() over (order by brand)
from brands
on conflict (brand, model) do update set active = true;

update public.vehicle_models set active = false
where brand in ('KGM');

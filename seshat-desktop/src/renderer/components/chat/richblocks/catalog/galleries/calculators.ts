import type { Gallery } from './types'

export const CALCULATORS: Gallery = {
  id: 'calculators',
  title: 'Calculators',
  description: 'Small tools that answer as you move a slider: money, motion, units and health.',
  tone: 'green',
  icon: 'calendar',
  examples: [
    {
      title: 'Compound interest',
      about: 'The balance, against simple interest.',
      code: `root = Card([plot, p, r, y, out], "Compound interest")
plot = Plot([Curve("p*(1+r/100)^x", "balance", "green"), Curve("p + p*r/100*x", "simple interest", "orange", true)], 0, 30, null, null, null, "years", "EUR")
p = Slider("p", 1000, 20000, 5000, 500, "Amount (EUR)")
r = Slider("r", 0.5, 12, 5, 0.5, "Rate (% a year)")
y = Slider("y", 1, 30, 10, 1, "Years")
out = Live("After {{y}} years: **{{p*(1+r/100)^y}} EUR**, against {{p + p*r/100*y}} with simple interest.")`
    },
    {
      title: 'A loan',
      about: 'The monthly payment and what is left to pay.',
      code: `root = Card([plot, p, r, y, out], "Loan calculator")
plot = Plot([Curve("max(0, p*((1+r/1200)^(12*y) - (1+r/1200)^(12*x))/((1+r/1200)^(12*y) - 1))", "left to pay", "blue")], 0, 30, null, null, null, "years", "EUR")
p = Slider("p", 5000, 400000, 150000, 5000, "Borrowed (EUR)")
r = Slider("r", 1, 8, 3.5, 0.1, "Rate (% a year)")
y = Slider("y", 5, 30, 20, 1, "Years")
out = Live("Monthly payment: **{{p*(r/1200)/(1-(1+r/1200)^(-12*y))}} EUR**. Over {{y}} years you pay {{12*y*p*(r/1200)/(1-(1+r/1200)^(-12*y))}} EUR.")`
    },
    {
      title: 'A ball thrown',
      about: 'Angle and speed; the apex and where it lands.',
      code: `root = Card([plot, a, v, out], "Projectile")
plot = Plot([Curve("max(0, x*tan(a*pi/180) - 9.81*x^2/(2*v^2*cos(a*pi/180)^2))", "path", "blue"), Dot("v^2*sin(2*a*pi/180)/9.81", 0, "lands", "red"), Dot("v^2*sin(2*a*pi/180)/(2*9.81)", "v^2*sin(a*pi/180)^2/(2*9.81)", "apex", "orange")], 0, 260, 0, 130, null, "metres", "height")
a = Slider("a", 5, 85, 40, 1, "Angle (degrees)")
v = Slider("v", 10, 50, 30, 1, "Speed (m/s)")
out = Live("It lands {{v^2*sin(2*a*pi/180)/9.81}} m away, {{v^2*sin(a*pi/180)^2/(2*9.81)}} m high at the top, after {{2*v*sin(a*pi/180)/9.81}} s.")`
    },
    {
      title: 'Units',
      about: 'Kilograms, kilometres, degrees.',
      code: `root = Card([plot, u, c, out], "Unit converter")
plot = Plot([Curve("2.2046*x", "kg to lb", "blue", false, "value", "eq(u, 0)"), Curve("0.6214*x", "km to mi", "green", false, "value", "eq(u, 1)"), Curve("x*9/5 + 32", "C to F", "orange", false, "value", "eq(u, 2)")], 0, 100, null, null, null, "from", "to")
u = Select("u", ["kg to pounds", "km to miles", "Celsius to Fahrenheit"], 0, "Convert")
c = Slider("c", 0, 100, 20, 1, "Value")
out = Live("{{c}} gives **{{eq(u, 0)*c*2.2046 + eq(u, 1)*c*0.6214 + eq(u, 2)*(c*9/5 + 32)}}**")`
    },
    {
      title: 'Body mass index',
      about: 'Your point against the zones.',
      code: `root = Card([plot, w, h, out], "BMI")
plot = Plot([Curve("x/(h/100)^2", "BMI at this height", "blue"), HLine(18.5, "under", "teal"), HLine(25, "over", "orange"), HLine(30, "obese", "red"), Dot("w", "w/(h/100)^2", "you", "red")], 40, 140, 10, 45, null, "weight (kg)", "BMI")
w = Slider("w", 40, 140, 70, 1, "Weight (kg)")
h = Slider("h", 140, 210, 175, 1, "Height (cm)")
out = Live("Your BMI is **{{w/(h/100)^2}}**. Between 18.5 and 25 is the usual range.")`
    }
  ]
}
